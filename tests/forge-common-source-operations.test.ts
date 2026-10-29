import {describe,test,expect} from 'bun:test';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {runStagedMonsterExtraction,assembleStagedFeature,assembleStagedMonsterIntake,validateStagedBaseFacts} from '../packages/intake-ai/src/staged-extraction';
import {splitStagedMonsterSource,assembleStagedLinePartition,stagedSourceLines} from '../packages/intake-ai/src/staged-source';
import {bindSourceOperations,sourceOperationErrors,sourceOperationClauses,sourceFeatureBasicOmissions,sourceFeatureResources,materializeSourceOperationEvidence,sourceOperationTargetType,sourceSpellHeaderRange,sourceSpellHeaderBody,sourceOperationSelfTarget,sourceOperationSelfArea,sourceOperationExistingArea,sourceActorNameMatches,sourceDamageUpgradeOperations,type SourceOperation} from '@fvtt-json-generator/models/source-operations';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {OpenAICompatibleMonsterIntakeProvider,MonsterIntakeProviderError} from '@fvtt-json-generator/intake-ai/provider';
import {createRulePresentationPlan} from '@fvtt-json-generator/generation/rule-presentation';
import {assertActorSemantics} from '../foundry-modules/fvtt-json-forge/src/runtime';
import {dailySpellGrantLabel} from '../packages/intake-ai/src/spell-grant-label';
import {completeSourceFeatureEvidence} from '../packages/intake-ai/src/source-completeness';
import fixture from './fixtures/forge-common-source-operations.json';
import cloaker from './fixtures/cloaker-srd51-boundary.json';
import seaOld from './fixtures/forge-target-choice-intake.json';
import recordedProtocol from './fixtures/forge-recorded-contract-protocol-failures.json';
import recordedSpellChain from './fixtures/forge-spell-chain-neogi-recorded.json';
import roundTwoRules from './fixtures/forge-iterate50-round2-cases.json';
import roundThreeRules from './fixtures/forge-iterate50-round3-cases.json';
import roundFourRules from './fixtures/forge-iterate50-round4-cases.json';
import roundFiveRules from './fixtures/forge-iterate50-round5-cases.json';
import roundSixRules from './fixtures/forge-iterate50-round6-cases.json';
import roundSevenRules from './fixtures/forge-iterate50-round7-cases.json';
import roundEightRules from './fixtures/forge-iterate50-round8-cases.json';
import roundNineRules from './fixtures/forge-iterate50-round9-cases.json';
import roundTenRules from './fixtures/forge-iterate50-round10-cases.json';
import roundElevenRules from './fixtures/forge-iterate50-round11-cases.json';
import damageUpgrade from './fixtures/forge-damage-upgrade.json';
import {sourceFailedSaveStatuses,sourceSingleSpellAction} from '@fvtt-json-generator/models/source-rule-facts';
import {stagedSpellcastingGroups} from '../packages/intake-ai/src/staged-spellcasting';
import {stagedSpellParentPlan} from './helpers/staged-spell-plan';
import {newNeutralAttackContractVariant} from './helpers/neutral-source-contract';
import {resolveSpellRef,hashSourceInventoryMetadata,type SpellCandidateMetadata} from '../src/core/spell-resolution';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';


// Historical semantic negatives use the explicit offline audit. The default
// binder still returns the proposed operations and only prepares their evidence.
function auditBoundSourceOperations(source:string,operations:unknown):SourceOperation[]{
  const bound=bindSourceOperations(source,operations),errors=sourceOperationErrors(source,bound);
  if(errors.length)throw new Error(errors.join(' | '));
  return bound;
}


const header=cloaker.source.slice(0,cloaker.source.indexOf('Damage Transfer.'));
const creature={identity:{name:'Cloaker',size:'large',creatureType:'aberration',alignment:'chaotic neutral'},abilities:{str:17,dex:15,con:12,int:13,wis:12,cha:14},attributes:{ac:14,acKind:'natural',hp:{value:78,formula:'12d10+12'},movement:{walk:10,fly:40},cr:8,xp:3900},saves:{},skills:{stealth:5},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{darkvision:60,passivePerception:11},languages:{values:['deep','undercommon']}};
const request=(source:string)=>({source,sourceSha256:hashSource(source),candidate:{id:'source',label:'Source',start:0,end:source.length,quote:source}});
const clauses=(source:string)=>sourceOperationClauses(source);

function expectSourceOperationProof(source:string,operation:SourceOperation){
  const ownClauses=clauses(operation.sourceText);
  for(const proof of Object.values(operation.proof)){
    if(typeof proof==='string')expect(ownClauses).toContain(proof);
    else if(Array.isArray(proof))for(const quote of proof)expect(ownClauses).toContain(quote);
    else if(proof!==undefined){
      expect(source).toContain(proof.sourceText);
      expect(clauses(proof.sourceText)).toContain(proof.quote);
    }
  }
}

describe('source operation proof union',()=>{
  test('ordinary clauses and an upgrade object retain their separate same-source parents',()=>{
    const base=damageUpgrade.case.features[0]!.text,context=damageUpgrade.case.features[1]!.text;
    const operations=sourceDamageUpgradeOperations(base,[context]);
    expect(operations).toBeDefined();if(!operations)throw Error('Expected the existing same-source damage upgrade');
    expect(sourceOperationErrors(base,operations,[context])).toEqual([]);
    for(const operation of operations){
      expect(operation.proof.upgrade).toEqual({sourceText:context,quote:damageUpgrade.sources[0]!.completeActualProof});
      expectSourceOperationProof(damageUpgrade.case.source,operation);
    }
  });
  test('an upgrade cannot borrow its quote from the base parent or a rule outside the source',()=>{
    const base=damageUpgrade.case.features[0]!.text,context=damageUpgrade.case.features[1]!.text;
    const operations=sourceDamageUpgradeOperations(base,[context]);
    expect(operations).toBeDefined();if(!operations)throw Error('Expected the existing same-source damage upgrade');
    const operation=operations[0]!;
    expect(operation.proof.upgrade).toBeDefined();if(!operation.proof.upgrade)throw Error('Expected complete upgrade proof');
    for(const upgrade of [
      {...operation.proof.upgrade,quote:damageUpgrade.sources[1]!.completeActualProof},
      {...operation.proof.upgrade,sourceText:context+'\nForeign rule.'},
    ]){
      const wrong={...operation,proof:{...operation.proof,upgrade}};
      expect(()=>expectSourceOperationProof(damageUpgrade.case.source,wrong)).toThrow();
      expect(sourceOperationErrors(base,[wrong],[context]).length).toBeGreaterThan(0);
    }
  });
});

describe('frozen unclassified attacks and explicit new neutral-contract variants',()=>{
  for(const [corpus,id] of [[roundFourRules,'r13r-apparatus-of-the-crab'],[roundSixRules,'r15m-srd52-giant-seahorse-ram'],[roundSevenRules,'r16m-srd52-ankheg-bite'],[roundEightRules,'r17m-srd52-swarm-venomous-snakes-bites']] as const){
    test('the original frozen guessed weapon classification stays rejected: '+id,()=>{
      const parent=(corpus.cases as any[]).find(c=>c.id===id),before=JSON.stringify(parent),f=parent.features[0];
      expect(f.operations.filter((op:any)=>op.type==='attack').map((op:any)=>op.attack.type)).not.toContain('melee');
      expect(()=>bindSourceOperations(f.text,f.operations)).toThrow('attack/type-or-bonus');
      expect(JSON.stringify(parent)).toBe(before);
    });
    test('new neutral-contract variant preserves every other full-parent fact: '+id,()=>{
      const parent=(corpus.cases as any[]).find(c=>c.id===id),before=JSON.stringify(parent),f=parent.features[0],variant=newNeutralAttackContractVariant(f.operations,'melee');
      const restored=structuredClone(variant);for(const op of restored)if(op.type==='attack')op.attack.type='mwak';
      expect(restored).toEqual(f.operations);
      const bound=bindSourceOperations(f.text,variant);expect(sourceOperationErrors(f.text,bound)).toEqual([]);
      for(const op of bound){expect(op.sourceText).toBe(f.text);expect(op.evidence!.quote).toBe(f.text);for(const q of Object.values(op.proof).flat()){expect(typeof q).toBe('string');if(typeof q!=='string')throw Error('Expected a literal proof clause');expect(clauses(f.text)).toContain(q);}}
      expect(JSON.stringify(parent)).toBe(before);
    });
  }
});

function recordedCastingWording(replacement:string){
  const original='以魅力作为其施法属性',start=recordedSpellChain.source.indexOf(original),end=start+original.length;
  const source=recordedSpellChain.source.replace(original,replacement),delta=replacement.length-original.length;
  const offset=(value:number)=>value<=start?value:value>=end?value+delta:(()=>{throw Error('Test evidence cuts inside the replaced clause');})();
  const visit=(value:any):any=>{
    if(typeof value==='string')return value.replace(original,replacement);
    if(Array.isArray(value))return value.map(visit);
    if(!value||typeof value!=='object')return value;
    const next=Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,visit(entry)]));
    if(typeof value.start==='number'&&typeof value.end==='number'&&typeof value.quote==='string'){
      next.start=offset(value.start);next.end=offset(value.end);expect(source.slice(next.start,next.end)).toBe(next.quote);
    }
    return next;
  };
  const ir=visit(recordedSpellChain.ir);ir.source={sha256:hashSource(source),length:source.length};return{source,ir};
}
test.each(['以魅力作为其施法属性','施法属性：魅力','施法时使用魅力','以**魅力**作为其施法属性'])('existing Neogi source keeps the same real spell grants and nonspell mechanics through ordinary and staged ingress: %s',async wording=>{
  const {source,ir:reply}=recordedCastingWording(wording),before=JSON.stringify(recordedSpellChain);let calls=0;
  const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline-only',baseUrl:'https://offline.invalid/v1',model:'offline',reviewModel:'offline',timeoutMs:10000,repairTimeoutMs:10000,maxAttempts:1,
    httpClient:async()=>{calls++;return{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(reply)}}]})};}});
  const ordinary=await provider.extract(request(source));
  expect(calls).toBe(1);expect(validateMonsterIntakeIR(source,ordinary).blocking).toEqual([]);
  const profile=ordinary.creature.spellcasting![0]!,plan=stagedSpellParentPlan(source,profile),groups=[...stagedSpellcastingGroups(plan,new Map([[plan.features[0]!.id,{ability:profile.ability,evidence:profile.abilityEvidence[0]!}]])).values()];
  expect(groups).toHaveLength(1);expect(groups[0]!.ability).toBe('cha');
  expect(groups[0]!.usageGroups.flatMap(grant=>grant.spellRefs.map(ref=>ref.originalName))).toEqual(['任意门','隐形术']);
  const staged=structuredClone(ordinary);staged.creature.spellcasting=groups;
  expect(validateMonsterIntakeIR(source,staged).blocking).toEqual([]);
  const generate=(ir:typeof ordinary)=>{
    const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(new YamlParser().parse(markdown)) as any;
    expect(verifyMonsterIntake(source,ir,markdown,actor).findings).toEqual([]);return actor;
  };
  const ordinaryActor=generate(ordinary),stagedActor=generate(staged);
  const candidates=recordedSpellChain.destinationCandidates.map(candidate=>({...candidate,packageId:'dnd5e',packId:'spells24',uuid:`Compendium.${candidate.packId}.Item.${candidate.id}`})) as SpellCandidateMetadata[];
  for(const actor of [ordinaryActor,stagedActor]){
    const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest,unchanged=JSON.stringify(manifest);
    for(const group of manifest.spellcastingGroups)for(const ref of group.spellRefs){
      const resolution=resolveSpellRef({manifestId:manifest.manifestId,groupId:group.groupId,ref,candidates,sourceInventoryHash:hashSourceInventoryMetadata(candidates)});
      expect(resolution.status).toBe('resolved');if(resolution.status!=='resolved')throw Error('Expected recorded destination Spell');
      expect(resolution.trace.map(entry=>entry.code)).toContain('CONFIRM_ENGLISH_IDENTITY');
      const feature=actor.items.find((item:any)=>item.flags?.fvttJsonGenerator?.spellcastingFeatureKey===group.featureItemKey);
      expect(feature).toBeDefined();
      // Foundry assigns document IDs during creation. Reuse this source's archived
      // feature ID only at the pure Cast projection boundary; do not patch output.
      const {activity}=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'gROh1BzXTgVxF9V2',group,ref,selectedUuid:resolution.selected.uuid});
      expect(activity.type).toBe('cast');expect(activity.spell.uuid).toBe(resolution.selected.uuid);
      expect(activity.spell.ability).toBe('cha');expect(activity.spell.properties).toEqual([]);
      expect(activity.uses).toMatchObject({spent:0,max:'1',recovery:[{period:'day',type:'recoverAll'}]});
      expect(activity.consumption.targets).toEqual([{type:'activityUses',value:'1'}]);
    }
    expect(JSON.stringify(manifest)).toBe(unchanged);
  }
  const grants=(actor:any)=>actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs.map((ref:any)=>({identifier:ref.identifier,ability:group.ability,uses:ref.uses,ignoresMaterialComponents:ref.ignoresMaterialComponents})));
  expect(grants(stagedActor)).toEqual(grants(ordinaryActor));
  const nonspells=(actor:any)=>actor.items.filter((item:any)=>!item.flags?.fvttJsonGenerator?.spellcastingFeatureKey);
  expect(nonspells(stagedActor)).toEqual(nonspells(ordinaryActor));
  expect(JSON.stringify(recordedSpellChain)).toBe(before);
});

describe('source-bound parenthetical attack bonus choices',()=>{
  const header=(condition='with shillelagh')=>`Melee Weapon Attack: +2 to hit (+4 to hit ${condition}), reach 5 ft., one target.`;
  const source=(condition='with shillelagh')=>'Quarterstaff. '+header(condition);
  const operations=(condition='with shillelagh'):any[]=>[
    {id:'normal',name:'Normal attack',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:2,reach:5},targetSpecial:'one target',proof:{attack:header(condition),target:header(condition)}},
    {id:'conditional',name:'Conditional attack',type:'attack',relationship:'alternative',condition,attack:{type:'mwak',toHit:4,reach:5},targetSpecial:'one target',proof:{attack:header(condition),target:header(condition)}},
  ];
  for(const condition of ['with shillelagh','while invisible','if wielding a magic weapon','when standing on stone','while affected by a spell'])test('keeps both proven attack bonuses and the literal condition: '+condition,()=>{
    const input=source(condition),bound=bindSourceOperations(input,operations(condition));
    expect(bound.map(op=>op.attack?.toHit)).toEqual([2,4]);expect(bound[0]!.condition).toBeUndefined();expect(bound[1]!.condition).toBe(condition);
    expect(sourceOperationErrors(input,bound)).toEqual([]);
    const materialized=materializeSourceOperationEvidence(input,operations(condition)) as SourceOperation[];expect(materialized[1]!.condition).toBe(condition);expect(sourceOperationErrors(input,materialized)).toEqual([]);
  });
  test('missing, reversed, duplicated or unconditional choices cannot hide behind the full parent',()=>{
    const input=source(),correct=operations();
    expect(()=>bindSourceOperations(input,[correct[0]])).toThrow('inventory/attack-choice-omitted');
    for(const mutate of [
      (ops:any[])=>{ops[0].attack.toHit=4;ops[1].attack.toHit=2;},
      (ops:any[])=>{ops[1].attack.toHit=2;},
      (ops:any[])=>{delete ops[1].condition;},
      (ops:any[])=>{ops[1].condition='shillelagh';},
      (ops:any[])=>{ops[1].condition='with imaginary blessing';},
      (ops:any[])=>{ops[0].condition='with shillelagh';},
      (ops:any[])=>{ops[1].relationship='follow-up';},
      (ops:any[])=>{ops[1].targetSpecial='target';},
      (ops:any[])=>{ops.push({...structuredClone(ops[1]),id:'duplicate'});},
    ]){const wrong=structuredClone(correct);mutate(wrong);expect(()=>bindSourceOperations(input,wrong)).toThrow('InvalidSourceOperations');}
    for(const feature of [{name:'Quarterstaff',description:input,executionMode:'gm-manual',activityType:'utility'},{name:'Quarterstaff',description:input,attack:{type:'mwak',toHit:2,reach:5}}])expect(sourceFeatureBasicOmissions(input,feature as any)).toContain('attack-choice');
  });
  test('an unrelated operation cannot be inserted between the corresponding default and alternative',()=>{
    const extra='Ranged Weapon Attack: +3 to hit, range 20/60 ft., one target.',input=source()+' Other Shot. '+extra,ops=operations();
    ops.splice(1,0,{id:'other',name:'Other shot',type:'attack',relationship:'follow-up',attack:{type:'rwak',toHit:3,range:20,longRange:60},proof:{attack:extra}});
    expect(()=>bindSourceOperations(input,ops)).toThrow('relationship/unproven-alternative');
  });
  test('a second bonus is not proof of a second safe mode when it also changes other attack facts',()=>{
    for(const parenthetical of ['+4 to hit with shillelagh, reach 10 ft.','+4 to hit with shillelagh against two targets','+4 to hit when making a second attack','+4 to hit with shillelagh or +6 to hit while invisible','+4 to hit if not invisible','+4 to hit without shillelagh']){
      const attack=header().replace('+4 to hit with shillelagh',parenthetical),input='Quarterstaff. '+attack,ops=operations();for(const op of ops){op.proof.attack=attack;op.proof.target=attack;}
      expect(()=>bindSourceOperations(input,ops)).toThrow('attack/type-or-bonus');
    }
    const attack='Melee Weapon Attack: +2 to hit or +4 to hit, reach 5 ft., one target.',input='Quarterstaff. '+attack,ops=operations();for(const op of ops){op.proof.attack=attack;op.proof.target=attack;}
    expect(()=>bindSourceOperations(input,ops)).toThrow('attack/type-or-bonus');
  });
  test('an ordinary single-bonus attack retains its existing contract and duplicate-proof rejection',()=>{
    const attack='Melee Weapon Attack: +2 to hit, reach 5 ft., one target.',input='Quarterstaff. '+attack,op=operations()[0]!;op.proof={attack,target:attack};
    const bound=bindSourceOperations(input,[op]);expect(sourceOperationErrors(input,bound)).toEqual([]);expect(sourceFeatureBasicOmissions(input,{name:'Quarterstaff',description:input,attack:op.attack} as any)).toEqual([]);
    expect(()=>bindSourceOperations(input,[op,{...structuredClone(op),id:'copy',relationship:'alternative'}])).toThrow('duplicate-operation');
  });
  test('each-creature-within prose proves a radius without borrowing a single-target or unrelated distance',()=>{
    const operation=(quote:string,radius=60):any=>({id:'moan',name:'Moan',type:'save',relationship:'primary',save:{dc:13,abilities:['wis'],choice:'single',outcome:'none'},aoe:{shape:'radius',radius},proof:{save:quote,aoe:quote}});
    for(const determiner of ['Each','Every','Any']){
      const quote=`${determiner} creature within 60 feet of the cloaker that can hear its moan and that isn't an aberration must succeed on a DC 13 Wisdom saving throw.`,input='Moan. '+quote;
      expect(sourceOperationErrors(input,bindSourceOperations(input,[operation(quote)]))).toEqual([]);
      expect(()=>bindSourceOperations(input,[operation(quote,30)])).toThrow('/aoe');
    }
    for(const quote of ['One creature within 60 feet of the cloaker must succeed on a DC 13 Wisdom saving throw.','Each creature within 30 feet of the cloaker carrying a 60-foot rope must succeed on a DC 13 Wisdom saving throw.','A creature 60 feet away watches each creature that must succeed on a DC 13 Wisdom saving throw.'])expect(()=>bindSourceOperations('Moan. '+quote,[operation(quote)])).toThrow('/aoe');
  });
});

describe('source-bound incoming thresholds, save triggers and printed save labels',()=>{
  const saveOperation=(quote:string,dc=15,ability='dex',damage?:string):any=>({id:'save',name:'Save',type:'save',relationship:'primary',save:{dc,abilities:[ability],choice:'single',outcome:'none'},proof:{save:quote,...(damage?{damage:[quote]}:{})},...(damage?{damage:[{formula:damage,type:'fire',relationship:'base'}]}:{})});
  for(const id of ['r11r-falling-net','r11r-rolling-sphere','r11r-poisons'])test('preserves every source operation from the full newly failed parent: '+id,()=>{
    const example=(roundTwoRules.cases as any[]).find(example=>example.id===id),feature=example.features[0],input=feature.text,before=JSON.stringify(example),bound=bindSourceOperations(input,feature.operations);
    expect(bound.length).toBe(id==='r11r-poisons'?16:1);expect(sourceOperationErrors(input,bound)).toEqual([]);
    for(const op of bound){expect(op.sourceText).toBe(input.trim());expect(op.evidence!.quote).toBe(input.trim());for(const quote of [op.proof.save,...op.proof.damage??[]].filter(Boolean))expect(input.includes(quote)).toBe(true);}
    expect(JSON.stringify(example)).toBe(before);
  });
  test('an incoming object-destruction threshold neither requires nor permits an outgoing damage roll',()=>{
    const save='A creature must make a DC 10 Strength saving throw.',threshold='Dealing 5 slashing damage to the net (AC 10) destroys a 5-foot-square section of it.',input='Net. '+save+' '+threshold,op=saveOperation(save,10,'str');
    expect(sourceOperationErrors(input,bindSourceOperations(input,[op]))).toEqual([]);
    const wrong={id:'wrong',name:'Invented outgoing threshold damage',type:'damage',relationship:'follow-up',damage:[{formula:'5',type:'slashing',relationship:'conditional'}],proof:{damage:[threshold]}};
    expect(()=>bindSourceOperations(input,[op,wrong])).toThrow('negation-or-binding');
    const output='The net deals 5 slashing damage to the creature.',actual='Net. '+save+' '+output;
    expect(()=>bindSourceOperations(actual,[op])).toThrow('inventory/damage-omitted');
    expect(sourceFeatureBasicOmissions(actual,{name:'Net',description:actual,save:{dc:10,ability:'str',outcome:'none'}} as any)).toContain('damage');
  });
  test('an input threshold cannot erase a later real damage output in its own sentence',()=>{
    const save='A creature must make a DC 10 Strength saving throw.',quote='Dealing 5 slashing damage to the chain destroys a link, and the creature takes 1d6 fire damage.',input='Chain. '+save+' '+quote,op={id:'fire',name:'Fire',type:'damage',relationship:'follow-up',damage:[{formula:'1d6',type:'fire',relationship:'conditional'}],proof:{damage:[quote]}};
    expect(sourceOperationErrors(input,bindSourceOperations(input,[saveOperation(save,10,'str'),op]))).toEqual([]);
    const wrong=structuredClone(op);wrong.damage[0]!.formula='5';wrong.damage[0]!.type='slashing';expect(()=>bindSourceOperations(input,[saveOperation(save,10,'str'),wrong])).toThrow('negation-or-binding');
  });
  for(const trigger of ["Whenever the orb enters a creature's space",'If the poison remains active','When the creature touches the stone'])test('a proven Save trigger is retained without becoming an extra damage-only qualification: '+trigger,()=>{
    const quote=trigger+', that creature must succeed on a DC 15 Dexterity saving throw or take 2d6 fire damage.',input='Contact. '+quote,op={...saveOperation(quote,15,'dex','2d6'),condition:input};
    const bound=bindSourceOperations(input,[op]);expect(bound[0]!.condition).toBe(input);expect(bound[0]!.damage![0]!.relationship).toBe('base');expect(sourceOperationErrors(input,bound)).toEqual([]);
    const missing=structuredClone(op);delete missing.condition;expect(()=>bindSourceOperations(input,[missing])).toThrow('damage/0/condition');
    for(const qualified of [quote.replace('or take 2d6 fire damage','or take 2d6 fire damage if the target is a plant'),quote.replace('or take 2d6 fire damage','or, if the target is a plant, take 2d6 fire damage')]){
      const changed='Contact. '+qualified,wrong={...saveOperation(qualified,15,'dex','2d6'),condition:changed};expect(()=>bindSourceOperations(changed,[wrong])).toThrow('damage/0/condition');
    }
  });
  test('fixed printed save-label word breaks preserve exact proof text and evidence positions',()=>{
    for(const label of ['saving throw','s aving throw','saving t hrow']){
      const quote='A creature must make a DC 16 Constitution '+label+' or take 1d6 fire damage.',input='Dose. '+quote,op=saveOperation(quote,16,'con','1d6'),bound=bindSourceOperations(input,[op],37);
      expect(bound[0]!.proof.save).toBe(quote);expect(bound[0]!.sourceText).toBe(input);expect(bound[0]!.evidence).toEqual({start:37,end:37+input.length,quote:input});expect(sourceOperationErrors(input,bound)).toEqual([]);
      const wrong=structuredClone(op);wrong.save.dc=17;expect(()=>bindSourceOperations(input,[wrong])).toThrow('save/dc-or-ability');
      expect(sourceFeatureBasicOmissions(input,{name:'Dose',description:input,executionMode:'gm-manual',activityType:'utility'} as any)).toContain('save');
    }
    for(const label of ['s aving account then throw','s aving, throw','saving long t hrow','s a v i n g throw','s aving throwaway','saving check']){
      const quote='A creature must make a DC 16 Constitution '+label+'.';expect(()=>bindSourceOperations('Dose. '+quote,[saveOperation(quote,16,'con')])).toThrow('save/dc-or-ability');
    }
  });
  test('successive failed saves never imply a successful-save damage branch or lose a later identical roll',()=>{
    const example=(roundTwoRules.cases as any[]).find(example=>example.id==='r11r-poisons'),feature=example.features[0],input=feature.text,correct=structuredClone(feature.operations),wrong=structuredClone(correct);
    wrong[1].save.outcome='half';expect(()=>bindSourceOperations(input,wrong)).toThrow('save/outcome');
    const missing=structuredClone(correct);missing.splice(10,1);expect(()=>bindSourceOperations(input,missing)).toThrow('inventory/damage-omitted');
    const swapped=structuredClone(correct);[swapped[2].proof.damage,swapped[10].proof.damage]=[swapped[10].proof.damage,swapped[2].proof.damage];expect(()=>bindSourceOperations(input,swapped)).toThrow('source-order');
  });
});

describe('source occurrences, enumerated type choices and independent Save properties',()=>{
  const fixedSave=(id:string,proof:string,damageProof?:string,damage='1d6',type='fire',outcome='none'):any=>({id,name:id,type:'save',relationship:id==='first'?'primary':'follow-up',save:{dc:12,abilities:['dex'],choice:'single',outcome},proof:{save:proof,...(damageProof?{damage:[damageProof]}:{})},...(damageProof?{damage:[{formula:damage,type,relationship:'base'}]}:{})});
  for(const id of ['r12m-srd52-sphinx-valor-roar','r12r-elemental-fury','r12r-javelin-of-lightning'])test('keeps the full newly failed source control without changing its proposal: '+id,()=>{
    const parent=(roundThreeRules.cases as any[]).find(parent=>parent.id===id),feature=parent.features[0],input=feature.text,before=JSON.stringify(parent),bound=bindSourceOperations(input,feature.operations);
    expect(sourceOperationErrors(input,bound)).toEqual([]);expect(JSON.stringify(parent)).toBe(before);
  });
  test('identical Save sentences bind their separate printed positions, outcomes and damage owners',()=>{
    const save='Dexterity Saving Throw: DC 12, one creature.',fire='Failure: 1d6 Fire damage.',cold='Failure: 2d6 Cold damage.',source='Trial. First Pulse. '+save+' '+fire+' Success: Half damage. Second Pulse. '+save+' '+cold+' Success: No damage.',ops=[fixedSave('first',save,fire,'1d6','fire','half'),fixedSave('second',save,cold,'2d6','cold')];
    expect(sourceOperationErrors(source,bindSourceOperations(source,ops))).toEqual([]);
    expect(()=>bindSourceOperations(source,[ops[0]])).toThrow('inventory/save-omitted');
    expect(()=>bindSourceOperations(source,[...ops,{...structuredClone(ops[1]),id:'third'}])).toThrow('duplicate-operation');
    const swapped=[{...structuredClone(ops[1]),id:'first',relationship:'primary'},{...structuredClone(ops[0]),id:'second',relationship:'follow-up'}];expect(()=>bindSourceOperations(source,swapped)).toThrow('operation-owner');
    const borrowed=structuredClone(ops);borrowed[0].proof.damage=[cold];borrowed[0].damage=[{formula:'2d6',type:'cold',relationship:'base'}];expect(()=>bindSourceOperations(source,borrowed)).toThrow('operation-owner');
    const unproven=structuredClone(ops);unproven[1].relationship='alternative';expect(()=>bindSourceOperations(source,unproven)).toThrow('relationship/unproven-alternative');
    const single='Trial. '+save+' '+fire+' Success: Half damage.';expect(()=>bindSourceOperations(single,[ops[0],{...structuredClone(ops[0]),id:'copy',relationship:'follow-up'}])).toThrow('duplicate-operation');
  });
  test('identical printed damage sentences stay separate atoms of their own repeated Saves',()=>{
    const save='Dexterity Saving Throw: DC 12, one creature.',hit='Failure: 1d6 Fire damage.',source='Trial. First Pulse. '+save+' '+hit+' Second Pulse. '+save+' '+hit,ops=[fixedSave('first',save,hit),fixedSave('second',save,hit)];
    expect(sourceOperationErrors(source,bindSourceOperations(source,ops))).toEqual([]);
    const omitted=structuredClone(ops);delete omitted[1].damage;delete omitted[1].proof.damage;expect(()=>bindSourceOperations(source,omitted)).toThrow('inventory/damage-omitted');
  });
  test('an explicit named choice can select siblings with identical Save text without borrowing either result',()=>{
    const save='Dexterity Saving Throw: DC 12, one creature.',fire='Failure: 1d6 Fire damage.',cold='Failure: 2d6 Cold damage.',source='Choice. The creature chooses one of the following effects: Fire Pulse. '+save+' '+fire+' Cold Pulse. '+save+' '+cold,ops=[fixedSave('first',save,fire),{...fixedSave('second',save,cold,'2d6','cold'),relationship:'alternative'}];
    expect(sourceOperationErrors(source,bindSourceOperations(source,ops))).toEqual([]);
    const wrong=structuredClone(ops);wrong[1].proof.damage=[fire];wrong[1].damage=[{formula:'1d6',type:'fire',relationship:'base'}];expect(()=>bindSourceOperations(source,wrong)).toThrow('operation-owner');
  });
  test('comma-separated final-OR choices stay one die with the complete ordered type inventory',()=>{
    const quote='When you hit, the target takes an extra 1d8 Cold, Fire, Lightning, or Thunder damage.',source='Strike. '+quote,part={formula:'1d8',type:'cold',types:['cold','fire','lightning','thunder'],relationship:'conditional'},op:any={id:'choice',name:'Choice',type:'damage',relationship:'follow-up',damage:[part],proof:{damage:[quote]}};
    expect(sourceOperationErrors(source,bindSourceOperations(source,[op]))).toEqual([]);
    for(const list of ['Cold,Fire,Lightning,or Thunder','Cold, Fire, Lightning or Thunder']){const changed=quote.replace('Cold, Fire, Lightning, or Thunder',list),equivalent=structuredClone(op);equivalent.proof.damage=[changed];expect(sourceOperationErrors('Strike. '+changed,bindSourceOperations('Strike. '+changed,[equivalent]))).toEqual([]);}
    const selected=structuredClone(op);selected.damage[0].type='thunder';expect(sourceOperationErrors(source,bindSourceOperations(source,[selected]))).toEqual([]);
    for(const types of [['cold','fire','lightning'],['cold','fire','lightning','acid'],['cold','fire','lightning','thunder','thunder'],['fire','cold','lightning','thunder']]){const wrong=structuredClone(op);wrong.damage[0].types=types;expect(()=>bindSourceOperations(source,[wrong])).toThrow('negation-or-binding');}
    const duplicated=structuredClone(op);duplicated.damage.push(structuredClone(part));duplicated.proof.damage.push(quote);expect(()=>bindSourceOperations(source,[duplicated])).toThrow('duplicate-part');
    const allTypes=structuredClone(op);allTypes.damage=part.types.map(type=>({formula:'1d8',type,relationship:'conditional'}));allTypes.proof.damage=part.types.map(()=>quote);expect(()=>bindSourceOperations(source,[allTypes])).toThrow('negation-or-binding');
    for(const replacement of ['Cold, Fire, Lightning, and Thunder','Cold and Fire','Cold, Fire, Lightning, Thunder']){const changed=quote.replace('Cold, Fire, Lightning, or Thunder',replacement),wrong=structuredClone(op);wrong.proof.damage=[changed];expect(()=>bindSourceOperations('Strike. '+changed,[wrong])).toThrow('negation-or-binding');}
  });
  test('legacy OR choices and explicitly separate AND damage keep their different contracts',()=>{
    const or='The target takes 1d8 Cold or Fire damage.',choice:any={id:'choice',name:'Choice',type:'damage',relationship:'primary',damage:[{formula:'1d8',type:'cold',types:['cold','fire'],relationship:'base'}],proof:{damage:[or]}};
    expect(sourceOperationErrors('Strike. '+or,bindSourceOperations('Strike. '+or,[choice]))).toEqual([]);
    const and='The target takes 1d8 Cold damage and 1d8 Fire damage.',both:any={id:'both',name:'Both',type:'damage',relationship:'primary',damage:[{formula:'1d8',type:'cold',relationship:'base'},{formula:'1d8',type:'fire',relationship:'additional'}],proof:{damage:[and,and]}};
    expect(sourceOperationErrors('Strike. '+and,bindSourceOperations('Strike. '+and,[both]))).toEqual([]);
    const wrong=structuredClone(choice);wrong.proof.damage=[and];expect(()=>bindSourceOperations('Strike. '+and,[wrong])).toThrow('negation-or-binding');
  });
  test('forgoing an attack is not an Attack declaration, while an actual Hit still owns its follow-up Save',()=>{
    const save='The target makes a DC 12 Dexterity saving throw.',source='Bolt. You can forgo making a ranged attack roll. '+save;
    expect(sourceOperationErrors(source,bindSourceOperations(source,[fixedSave('first',save)]))).toEqual([]);
    const attack='Melee Weapon Attack: +5 to hit, reach 5 ft., one creature.',hit='Hit: 1 Piercing damage, and the target makes a DC 12 Dexterity saving throw.',actual='Needle. '+attack+' '+hit,attackOp:any={id:'attack',name:'Attack',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:5,reach:5},damage:[{formula:'1',type:'piercing',relationship:'base'}],proof:{attack,damage:[hit]}},followup=fixedSave('second',hit);
    expect(sourceOperationErrors(actual,bindSourceOperations(actual,[attackOp,followup]))).toEqual([]);
    expect(()=>bindSourceOperations(actual,[fixedSave('first',hit)])).toThrow('save/follow-up');
  });
  test('conditional or multiple daily quotas never flatten into an unqualified maximum',()=>{
    for(const title of ['Resistance (3/Day, or 4/Day in Lair)','Resistance (3/Day, or 3/Day in Lair)','Resistance (4/Day in Lair)','Resistance (3/Day only while underwater)','抵抗（每日3次，巢穴内每日4次）']){
      const source=title+'. If the creature fails a saving throw, it can choose to succeed instead.';expect(sourceFeatureResources(title,source).uses).toBeUndefined();
    }
    const original='Resistance (3/Day, or 4/Day in Lair). If the creature fails a saving throw, it can choose to succeed instead.';
    for(const changed of ['Resistance','Resistance (3/Day)','Resistance (4/Day)','Resistance (3/Day, or 3/Day in Lair)','Resistance (4/Day only while underwater)'])expect(sourceFeatureResources(changed,original).uses).toBeUndefined();
    for(const title of ['Steady (2/Day)','稳固（每日2次）','稳固（2次/日）'])expect(sourceFeatureResources(title,title+'. The creature watches.').uses).toEqual({max:2,period:'day'});
  });
});

describe('source clause order and Chinese parent identity',()=>{
  const attack='近战武器攻击：命中+5，触及5尺，单一目标。';
  const hit='命中：7（1d8+3）点穿刺伤害加14（4d6）点毒素伤害，并且目标必须成功通过一次DC12的体质豁免，否则陷入1分钟中毒状态。';
  const ops=(damage=hit,save=hit):any[]=>[{id:'attack',name:'Attack',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:5,reach:5},damage:[{formula:'1d8+3',type:'piercing',relationship:'base'},{formula:'4d6',type:'poison',relationship:'additional'}],proof:{attack,damage:[damage,damage]}},{id:'save',name:'Save',type:'save',relationship:'follow-up',save:{dc:12,abilities:['con'],choice:'single',outcome:'none'},proof:{save}}];
  test('hit damage precedes a later Save in the same complete sentence and retains both native rolls',async()=>{
    const source='毒牙Venom Fang。'+attack+hit,operations=bindSourceOperations(source,ops());expect(sourceOperationErrors(source,operations)).toEqual([]);
    const feature='**毒牙Venom Fang。**'+attack+hit,{actor}=await formal('attack',header+'Actions\n'+feature+'\n',feature,()=>ops()),activities=Object.values(actor.items[0].system.activities) as any[];
    expect(activities.map(activity=>activity.type)).toEqual(['attack','save']);expect(activities[0].damage.parts).toHaveLength(2);expect(activities[1].save.ability).toEqual(['con']);expect(activities[1].consumption.targets).toEqual([]);
  });
  test('an earlier Save cannot lend its damage to the preceding Attack, even inside one sentence',()=>{
    for(const join of ['。','，']){const save='目标必须通过DC12体质豁免'+join,damage=save+'命中：7（1d8+3）点穿刺伤害加14（4d6）点毒素伤害。',source='毒牙Venom Fang。'+attack+damage,c=clauses(source),proof=c.at(-1)!;expect(()=>bindSourceOperations(source,ops(proof,c.find(q=>q.includes('DC12'))!))).toThrow('operation-owner');}
  });
  test('a new Attack before damage keeps its own parts and cannot lend them to the previous Attack',()=>{
    const next='Melee Weapon Attack: +9 to hit, reach 5 ft., one target, Hit: 7 (1d8+3) piercing damage plus 14 (4d6) poison damage.',source='双击Twin Strike。'+attack+next,first=ops(next)[0],second={id:'second',name:'Second Attack',type:'attack',relationship:'follow-up',attack:{type:'mwak',toHit:9,reach:5},proof:{attack:next}};
    expect(()=>bindSourceOperations(source,[first,second])).toThrow('operation-owner');const own=structuredClone(first);delete own.damage;delete own.proof.damage;expect(()=>bindSourceOperations(source,[own,{...second,damage:first.damage,proof:{attack:next,damage:[next,next]}}])).not.toThrow();
  });
  function repeatedDamage(beforeSave:boolean){
    const first='命中：7（2d6）火焰伤害',second='7（2d6）火焰伤害',save='目标必须进行DC12体质豁免',proof=beforeSave?first+'加'+second+'，并且'+save+'。':first+'，并且'+save+'，失败时受到'+second+'。';
    const damage=[{formula:'2d6',type:'fire',relationship:'base'},{formula:'2d6',type:'fire',relationship:'additional'}],operations=ops(proof,proof);operations[0].damage=damage;return{source:'双灼Twin Burn。'+attack+proof,proof,operations};
  }
  test('identical damage before and after a Save cannot both borrow the first atom owner',()=>{
    const {source,operations}=repeatedDamage(false);expect(()=>bindSourceOperations(source,operations)).toThrow('operation-owner');
  });
  test('a follow-up Save cannot steal Hit damage printed before its own DC in the same sentence',()=>{
    const source='Fang. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 1d6 piercing damage, and the target must make a DC 12 Constitution saving throw.',c=clauses(source),operations=[{id:'attack',name:'Attack',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:5,reach:5},proof:{attack:c[1]}},{id:'save',name:'Save',type:'save',relationship:'follow-up',save:{dc:12,abilities:['con'],choice:'single',outcome:'none'},damage:[{formula:'1d6',type:'piercing',relationship:'base'}],proof:{save:c[2],damage:[c[2]]}}];expect(()=>bindSourceOperations(source,operations)).toThrow('operation-owner');
  });
  test('distinct repeated damage atoms bind in source order within an Attack and across its follow-up Save',()=>{
    const ordinary=repeatedDamage(true);expect(()=>bindSourceOperations(ordinary.source,ordinary.operations)).not.toThrow();
    const after=repeatedDamage(false),part=after.operations[0].damage.pop();after.operations[0].proof.damage.pop();after.operations[1].damage=[{...part,relationship:'base'}];after.operations[1].proof.damage=[after.proof];expect(()=>bindSourceOperations(after.source,after.operations)).not.toThrow();
  });
  test('one exclusive damage type choice is still one atom rather than two repeated damage parts',()=>{
    const proof='命中：7（2d6）火焰或寒冷伤害，并且目标必须进行DC12体质豁免。',source='择焰Choice Flame。'+attack+proof,operations=ops(proof,proof);operations[0].damage=[{formula:'2d6',type:'fire',types:['fire','cold'],relationship:'base'}];operations[0].proof.damage=[proof];expect(()=>bindSourceOperations(source,operations)).not.toThrow();
    operations[0].damage.push({...operations[0].damage[0]});operations[0].proof.damage.push(proof);expect(()=>bindSourceOperations(source,operations)).toThrow();
  });
  test('a Save still owns its own same-sentence failed damage',()=>{
    const source='Breath. Each creature must make a DC 12 Constitution saving throw, taking 2d6 poison damage on a failed save.',proof=clauses(source)[1]!;expect(()=>bindSourceOperations(source,[{id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:12,abilities:['con'],choice:'single',outcome:'none'},damage:[{formula:'2d6',type:'poison',relationship:'base'}],proof:{save:proof,damage:[proof]}}])).not.toThrow();
  });
  test('Chinese rest recharge titles retain one use and short-or-long recovery in either order',()=>{
    expect(sourceFeatureResources('束缚Binding（长休或短休后充能）')).toEqual({uses:{max:1,period:'shortRest'}});
    for(const order of ['短休或长休','长休或短休','短休'])for(const verb of ['充能','恢复'])expect(sourceFeatureResources('束缚Binding（'+order+'后'+verb+'）')).toEqual({uses:{max:1,period:'shortRest'}});
    for(const verb of ['充能','恢复'])expect(sourceFeatureResources('束缚Binding（长休后'+verb+'）')).toEqual({uses:{max:1,period:'longRest'}});
    for(const qualifier of ['长休和短休后充能','不在短休后充能','长休或短休前充能'])expect(sourceFeatureResources('束缚Binding（'+qualifier+'）')).toEqual({});
    expect(sourceFeatureResources('束缚Binding','束缚Binding。移动30尺。目标在长休或短休后恢复生命值。')).toEqual({});expect(sourceFeatureResources('别的能力','束缚Binding（长休或短休后充能）。造成1d6火焰伤害。')).toEqual({});
  });
  test('a Chinese either-rest recharge title reaches the complete Actor as one short-rest use',async()=>{
    const feature='**束缚Binding（长休或短休后充能）。**目标必须进行DC12体质豁免。',proof='目标必须进行DC12体质豁免。',{actor}=await formal('attack',header+'Actions\n'+feature+'\n',feature,()=>[{id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:12,abilities:['con'],choice:'single',outcome:'none'},proof:{save:proof}}]);
    expect(actor.items[0].system.uses).toMatchObject({spent:0,max:'1',recovery:[{period:'sr',type:'recoverAll'}]});
  });
  function parent(source:string,description:string,name='缚爪',englishName='Binding Claw'){
    const evidence={start:0,end:source.length,quote:source},feature={name,englishName,description,evidence:[evidence]},ir:any={source:{sha256:hashSource(source),length:source.length},creature:{identity:{name:'Fixture'},actions:[feature]},claims:[{path:'/creature/actions/0',evidence:[evidence]}],coverage:[{...evidence,classification:'mechanical',claimPaths:['/creature/actions/0']}]};return{feature,ir,evidence};
  }
  test('Chinese and English title aliases preserve exact parent spans across stops and full-width resource metadata',()=>{
    const body='目标必须进行DC12体质豁免。失败：受到2d6毒素伤害。';
    for(const title of ['缚爪Binding Claw。','缚爪 Binding Claw.','缚爪Binding Claw（充能5-6）。','缚爪Binding Claw (Recharge 5-6).'])for(const description of [title+body,body]){const source=title+body,{feature,ir,evidence}=parent(source,description);expect(completeSourceFeatureEvidence(source,ir,feature,'/creature/actions/0')).toEqual(evidence);}
  });
  test('a partial or wrong bilingual title and an adjacent complete ability never become this parent',()=>{
    const source='缚爪Binding Claw。造成2d6毒素伤害。';for(const [name,english]of [['缚爪','Binding Fang'],['缚','Binding Claw'],['错爪','Binding Claw']]){const {feature,ir}=parent(source,source,name,english);expect(completeSourceFeatureEvidence(source,ir,feature,'/creature/actions/0')).toBeUndefined();}
    const next='尾刺Tail Spike。造成1d6火焰伤害。',combined=source+'\n'+next,{feature,ir}=parent(combined,combined);ir.claims.push({path:'/creature/actions/1',evidence:[{start:source.length+1,end:combined.length,quote:next}]});expect(completeSourceFeatureEvidence(combined,ir,feature,'/creature/actions/0')).toBeUndefined();
  });
  test('all provider prompts keep source-side spell identifiers distinct from internal refId keys',async()=>{
    const prompts:string[]=[],empty={schemaVersion:1,source:{sha256:hashSource(''),length:0},creature:{},claims:[],coverage:[],uncertainties:[]},replies=[empty,{schemaVersion:1,verdict:'accepted',findings:[]},{schemaVersion:1,operations:[]}];let calls=0;
    const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline',baseUrl:'https://offline.invalid/v1',model:'test',reviewModel:'test',timeoutMs:1000,repairTimeoutMs:1000,httpClient:async(_url,init)=>{prompts.push(JSON.parse(init.body).messages[0].content);return{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(replies[calls++])}}]})};}});
    await provider.extract(request(''));await provider.review({source:'',ir:empty,markdown:'',actorProjection:{}} as any);await provider.repair({stage:'deterministic-validation',source:'',ir:empty,deterministicFindings:[]} as any);
    for(const prompt of prompts){expect(prompt).toContain('identifier and all spell names must be source-side');expect(prompt).toContain('omit englishName');expect(prompt).not.toContain('Spell refs use stable English refId and identifier');}
  });
});
function operations(kind:keyof typeof fixture,source=fixture[kind]):unknown[]{
  const c=clauses(source),base={id:'primary',name:'Primary',relationship:'primary'};
  if(kind==='attack')return[{...base,type:'attack',attack:{type:'mwak',toHit:6,reach:5},damage:[{formula:'1d8+3',type:'piercing',relationship:'base'},{formula:'1d6',type:'fire',relationship:'additional'}],proof:{attack:c[1],damage:[c[2],c[2]]}},
    {id:'follow-up',name:'Constitution follow-up',type:'save',relationship:'follow-up',save:{dc:14,abilities:['con'],choice:'single',outcome:'none'},proof:{save:c[3]}}];
  if(kind==='choice')return[{...base,type:'save',save:{dc:16,abilities:['int','wis'],choice:'target',outcome:'half'},damage:[{formula:'2d6',type:'psychic',relationship:'base'}],aoe:{shape:'cone',radius:30},targetSpecial:'Each creature',proof:{save:c[1],damage:[c[2]],aoe:c[1],target:c[1]}}];
  if(kind==='conditional')return[{...base,type:'attack',attack:{type:'msak',toHit:5,reach:5},damage:[{formula:'1d6',type:'radiant',relationship:'base'}],proof:{attack:c[1],damage:[c[2]]}},
    {id:'conditional',name:'Prone damage (GM)',type:'damage',relationship:'follow-up',damage:[{formula:'2d6',type:'cold',relationship:'conditional'}],proof:{damage:[c[3]]}}];
  if(kind==='fixed')return[{...base,type:'attack',attack:{type:'mwak',toHit:4,reach:0},damage:[{formula:'1',type:'bludgeoning',relationship:'base'}],proof:{attack:c[1],damage:[c[2]]}}];
  return[];
}
async function formal(kind:keyof typeof fixture,source=header+'Actions\n'+fixture[kind]+'\n',feature=fixture[kind],transform:(ops:any[])=>any[]=(ops)=>ops){
  const calls:string[]=[];
  const ir=await runStagedMonsterExtraction(request(source),async call=>{
    calls.push(call.stage);await call.onAttempt(1);
    return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{schemaVersion:1,unitId:call.unitId,mode:'native-with-gm',facts:{sourceOperations:transform(operations(kind,feature))}};
  },{baseMode:'facts',featureMode:'model'});
  const validation=validateMonsterIntakeIR(source,ir);expect(validation.blocking,JSON.stringify(validation.blocking)).toEqual([]);
  const markdown=renderMonsterIntakeMarkdown(ir);
  const parsed=new YamlParser().parse(markdown);
  const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(parsed) as any;
  const verified=verifyMonsterIntake(source,ir,markdown,actor);
  expect(verified.findings.filter(f=>f.blocking),JSON.stringify(verified.findings)).toEqual([]);
  return{source,ir,markdown,actor,calls};
}

describe('common source operation contract through the complete Actor chain',()=>{
  test('attack, multiple damage parts and GM follow-up Save share one daily pool',async()=>{
    const {actor,ir}=await formal('attack'),item=actor.items[0],activities=Object.values(item.system.activities) as any[];
    expect(activities.map(a=>a.type)).toEqual(['attack','save']);expect(item.system.uses).toEqual({spent:0,max:'3',recovery:[{period:'day',type:'recoverAll'}]});
    expect(activities[0].attack).toMatchObject({flat:true,bonus:'6',type:{value:'melee',classification:'weapon'}});
    expect(activities[0].damage.parts.map((p:any)=>[p.number,p.denomination,p.bonus,p.types])).toEqual([[1,8,'3',['piercing']],[1,6,'',['fire']]]);
    expect(activities[0].damage.includeBase).toBe(false);expect(Object.hasOwn(activities[1].damage,'includeBase')).toBe(false);
    expect(activities[1].save).toEqual({ability:['con'],dc:{calculation:'',formula:'14'}});
    expect(activities[1].activation).toMatchObject({type:'special',override:true});expect(activities[1].consumption.targets).toEqual([]);
    expect(activities[0].consumption.targets).toEqual([{type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}}]);expect(item.effects).toEqual([]);
    expect(ir.creature.actions[0]!.sourceOperations![1]!.condition).toBe(fixture.attack);
  });
  test('target choice is one Save with both native ability buttons and intact cone',async()=>{
    const {actor}=await formal('choice'),item=actor.items[0],activity=Object.values(item.system.activities)[0] as any;
    expect(activity.save.ability).toEqual(['int','wis']);expect(activity.damage.onSave).toBe('half');expect(activity.target).toMatchObject({override:true,template:{type:'cone',size:'30',units:'ft'},affects:{special:'Each creature'}});
    expect(Object.hasOwn(activity.damage,'includeBase')).toBe(false);
    expect(item.system.uses).toMatchObject({max:'1',recovery:[{period:'recharge',type:'recoverAll',formula:'5'}]});expect(item.effects).toEqual([]);
  });
  test('the saved reverse-order target-choice source retains both attributes and its external emanation',async()=>{
    const feature=seaOld.ir.creature.actions[3]!.evidence[0]!.quote,c=clauses(feature),{actor,ir,markdown}=await formal('choice',header+'Actions\n'+feature+'\n',feature,()=>[{id:'choice',name:'Target choice Save',type:'save',relationship:'primary',save:{dc:15,abilities:['int','wis'],choice:'target',outcome:'none'},aoe:{shape:'radius',radius:15},proof:{save:c.find(q=>q.includes('DC 15'))!,aoe:c.find(q=>q.includes('Emanation'))!}}]);
    const item=actor.items[0],activity=Object.values(item.system.activities)[0] as any;expect(activity.save).toEqual({ability:['int','wis'],dc:{formula:'15',calculation:''}});expect(activity.range).toMatchObject({override:true,units:'spec'});expect(activity.range.special).toBeTruthy();expect(ir.creature.actions[0]!.sourceOperations![0]!.sourceText).toBe(feature.trim());expect(activity.target.template).toMatchObject({type:'radius',size:'15'});expect(item.effects).toEqual([]);expect(item.system.description.value).toContain('Target’s Choice');
    for(const mutate of [(ops:any[])=>{ops[0].save.abilities=['int'];},(ops:any[])=>{ops[0].save.dc=16;},(ops:any[])=>{ops[0].aoe.radius=30;}]){
      const ops=structuredClone(ir.creature.actions[0]!.sourceOperations!);mutate(ops);
      const plan=createRulePresentationPlan({sourceActor:actor,sourceIdentity:markdown,biographyFacts:[],consumedActions:[{logicalPath:'choice',itemIndex:0,action:{name:'Choice',type:'utility'},sourceStructured:{name:'Choice',type:'utility',describe:feature,sourceOperations:ops}}]});
      expect(plan.fields.flatMap(field=>field.segments).some(segment=>segment.kind==='fixed'&&segment.source.includes('Target’s Choice'))).toBe(false);
    }
  });
  test('two AND Saves consume one limited-use activation and leave the second check to the GM',async()=>{
    const feature='Twin Trial (3/Day). The target must make a DC 15 Strength saving throw and a DC 18 Dexterity saving throw.',proof=clauses(feature)[1]!,ops:any[]=[{id:'str',name:'Strength Save',type:'save',relationship:'primary',save:{dc:15,abilities:['str'],choice:'single',outcome:'none'},proof:{save:proof}},{id:'dex',name:'Dexterity Save',type:'save',relationship:'follow-up',save:{dc:18,abilities:['dex'],choice:'single',outcome:'none'},proof:{save:proof}}];
    const {actor}=await formal('choice',header+'Actions\n'+feature+'\n',feature,()=>ops),activities=Object.values(actor.items[0].system.activities) as any[];expect(activities.map(a=>a.save.ability)).toEqual([['str'],['dex']]);expect(activities[0].consumption.targets).toHaveLength(1);expect(activities[1].activation.type).toBe('special');expect(activities[1].consumption.targets).toEqual([]);
    const wrong=structuredClone(ops);wrong[1].relationship='alternative';expect(()=>bindSourceOperations(feature,wrong)).toThrow('unproven-alternative');
  });
  test('separate different-DC Saves may be alternatives only with a bound OR between them',async()=>{
    const feature='Choice Trial (3/Day). The target must make a DC 15 Strength saving throw or a DC 18 Dexterity saving throw.',proof=clauses(feature)[1]!,ops:any[]=[{id:'str',name:'Strength Save',type:'save',relationship:'primary',save:{dc:15,abilities:['str'],choice:'single',outcome:'none'},proof:{save:proof}},{id:'dex',name:'Dexterity Save',type:'save',relationship:'alternative',save:{dc:18,abilities:['dex'],choice:'single',outcome:'none'},proof:{save:proof}}];
    const {actor}=await formal('choice',header+'Actions\n'+feature+'\n',feature,()=>ops),activities=Object.values(actor.items[0].system.activities) as any[];expect(activities.every(a=>a.activation.type==='action'&&a.consumption.targets.length===1)).toBe(true);
    const mixed=structuredClone(ops);mixed[1].save={dc:18,abilities:['str','dex'],choice:'target',outcome:'none'};expect(()=>bindSourceOperations(feature,mixed)).toThrow('dc-or-ability');
  });
  test('conditional extra damage is a separate GM button and cannot join base damage',async()=>{
    const {actor}=await formal('conditional'),activities=Object.values(actor.items[0].system.activities) as any[];
    expect(activities.map(a=>a.type)).toEqual(['attack','damage']);expect(activities[0].damage.parts).toHaveLength(1);expect(activities[1].damage.parts[0]).toMatchObject({number:2,denomination:6,types:['cold']});expect(activities[1].activation.type).toBe('special');expect(activities[1].consumption.targets).toEqual([]);
    expect(activities[0].damage.includeBase).toBe(false);expect(Object.hasOwn(activities[1].damage,'includeBase')).toBe(false);
  });
  test('fixed damage and zero-foot reach remain literal',async()=>{
    const {actor}=await formal('fixed'),activity=Object.values(actor.items[0].system.activities)[0] as any;
    expect(activity.range).toMatchObject({value:0,units:'ft',override:true});expect(activity.damage.parts[0]).toMatchObject({custom:{enabled:true,formula:'1'},types:['bludgeoning']});
  });
  for(const [failure,status]of [['The target immediately dies.','dead'],['The target is blinded.','blinded'],['The target is poisoned.','poisoned']] as const)test('existing ordinary failure status remains linked only to its Save: '+status,async()=>{
    const feature=fixture.attack.replace('The target cannot recover until its next turn.',failure),{actor}=await formal('attack',header+'Actions\n'+feature+'\n',feature),item=actor.items[0],activities=Object.values(item.system.activities) as any[];
    expect(item.effects.map((effect:any)=>effect.statuses)).toEqual([[status]]);expect(activities[0].effects).toEqual([]);expect(activities[1].effects).toEqual([{_id:item.effects[0]._id,onSave:false}]);
  });
  for(const failure of ['The target is stunned until the end of its next turn.','The target is not blinded.','The target dies if it has 50 hit points or fewer.'])test('timed, negated or conditional consequences remain GM with the Save retained: '+failure,async()=>{
    const feature=fixture.attack.replace('The target cannot recover until its next turn.',failure),{actor}=await formal('attack',header+'Actions\n'+feature+'\n',feature);
    const item=actor.items[0],activities=Object.values(item.system.activities) as any[];
    expect(activities.map(activity=>activity.type)).toEqual(['attack','save']);
    if(failure.includes('not blinded'))expect(item.effects).toEqual([]);
    else{expect(item.effects).toHaveLength(1);expect(item.effects[0].statuses).toEqual(failure.includes('stunned')?['stunned','incapacitated']:['dead']);expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(item.effects[0].description).toContain(failure);expect(activities[0].effects).toEqual([]);expect(activities[1].effects).toEqual([{_id:item.effects[0]._id,onSave:false}]);}
  });
  for(const failure of ['The target is frightened. This condition lasts until the end of its next turn.','The target is frightened. The frightened condition ends at the end of its next turn.','The target is frightened. That condition lasts for 1 minute.','The target is blinded. It ends early when the target takes damage.','目标陷入恐慌。该状态持续到其下个回合结束。','目标受到中毒。目标在受到伤害后解除该状态。'])test('a later result sentence cannot create an indefinite status: '+failure,async()=>{
    const feature=fixture.attack.replace('The target cannot recover until its next turn.',failure),{actor}=await formal('attack',header+'Actions\n'+feature+'\n',feature);
    const item=actor.items[0],activities=Object.values(item.system.activities) as any[];
    expect(activities.map(activity=>activity.type)).toEqual(['attack','save']);expect(item.effects).toHaveLength(1);
    expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(item.effects[0].description).toContain(failure);
    expect(activities[0].effects).toEqual([]);expect(activities[1].effects).toEqual([{_id:item.effects[0]._id,onSave:false}]);
    expect(item.effects[0].duration.seconds).toBe(failure.includes('1 minute')?60:null);
  });
  test('local no-damage on success does not negate the failed-save damage',async()=>{
    const feature=fixture.choice.replace('or half as much damage on a successful one','and no damage on a successful save');
    const {actor}=await formal('choice',header+'Actions\n'+feature+'\n',feature,ops=>{ops[0].save.outcome='none';return ops;});
    const activity=Object.values(actor.items[0].system.activities)[0] as any;expect(activity.damage.onSave).toBe('none');expect(activity.damage.parts[0]).toMatchObject({number:2,denomination:6,types:['psychic']});
  });
  test('success/failure result scope continues across sentences and needs separate GM damage branches',async()=>{
    const feature='Memory Flare (Recharge 5-6). Each creature in a 30-foot cone must make a DC 16 Intelligence or Wisdom saving throw (the target chooses). Failure: The target takes 7 (2d6) psychic damage. Success: The target remains standing. It takes 3 (1d6) fire damage.';
    const c=clauses(feature),wrong=operations('choice',feature) as any[];wrong[0].save.outcome='none';wrong[0].damage.push({formula:'1d6',type:'fire',relationship:'additional'});wrong[0].proof.damage.push(c[4]);
    expect(()=>bindSourceOperations(feature,wrong)).toThrow();
    const {actor}=await formal('choice',header+'Actions\n'+feature+'\n',feature,ops=>{
      delete ops[0].damage;delete ops[0].proof.damage;ops[0].save.outcome='none';
      return[ops[0],{id:'failure',name:'Failed Save damage (GM)',type:'damage',relationship:'follow-up',damage:[{formula:'2d6',type:'psychic',relationship:'conditional'}],proof:{damage:[c[2]]}},{id:'success',name:'Successful Save damage (GM)',type:'damage',relationship:'follow-up',damage:[{formula:'1d6',type:'fire',relationship:'conditional'}],proof:{damage:[c[4]]}}];
    });
    const activities=Object.values(actor.items[0].system.activities) as any[];expect(activities.map(activity=>activity.type)).toEqual(['save','damage','damage']);expect(activities[0].damage.parts).toEqual([]);expect(activities.slice(1).every(activity=>activity.activation.type==='special'&&activity.consumption.targets.length===0)).toBe(true);
  });
  test('inline successful-save introducers keep their branch across following sentences',async()=>{
    const feature='Memory Flare (Recharge 5-6). Each creature in a 30-foot cone must make a DC 16 Intelligence or Wisdom saving throw (the target chooses). On a failed save, the target takes 7 (2d6) psychic damage. On a successful save, the target remains standing. It takes 3 (1d6) fire damage.';
    const c=clauses(feature),wrong=operations('choice',feature) as any[];wrong[0].save.outcome='none';wrong[0].damage.push({formula:'1d6',type:'fire',relationship:'additional'});wrong[0].proof.damage.push(c[4]);expect(()=>bindSourceOperations(feature,wrong)).toThrow();
    const {actor}=await formal('choice',header+'Actions\n'+feature+'\n',feature,ops=>{delete ops[0].damage;delete ops[0].proof.damage;ops[0].save.outcome='none';return[ops[0],{id:'failure',name:'Failure (GM)',type:'damage',relationship:'follow-up',damage:[{formula:'2d6',type:'psychic',relationship:'conditional'}],proof:{damage:[c[2]]}},{id:'success',name:'Success (GM)',type:'damage',relationship:'follow-up',damage:[{formula:'1d6',type:'fire',relationship:'conditional'}],proof:{damage:[c[4]]}}];});
    expect((Object.values(actor.items[0].system.activities) as any[]).map(a=>a.type)).toEqual(['save','damage','damage']);
  });
  test('shared legendary conditions stay on every independently operated button',async()=>{
    const context='Legendary Actions\nOnly while the moon is visible can this creature choose an option.\n',source=header+context+fixture.attack+'\n';
    const {actor,ir}=await formal('attack',source);expect(ir.creature.legendaryActions[0]!.sourceContext).toEqual([context]);
    for(const activity of Object.values(actor.items[0].system.activities) as any[])expect(activity.activation.condition).toContain(context);
  });
  for(const newline of ['\n','\r\n'])test('equivalent wrapping retains operations and complete source coordinates: '+JSON.stringify(newline),async()=>{
    const feature=fixture.attack.replace('Hit:','\nHit:').replace('The target','\nThe target').replace(/\n/gu,newline),source=header.replace(/\r?\n/gu,newline)+'Actions'+newline+feature+newline;
    const {actor,ir}=await formal('attack',source,feature);expect(Object.keys(actor.items[0].system.activities)).toHaveLength(2);
    for(const op of ir.creature.actions[0]!.sourceOperations!)expect(source.slice(op.evidence!.start,op.evidence!.end)).toBe(op.sourceText);
  });
  test('mutating generated fields, includeBase or source evidence is detected',async()=>{
    const {source,ir,markdown,actor}=await formal('attack');
    for(const mutate of [(a:any)=>{Object.values(a.items[0].system.activities).forEach((v:any)=>{if(v.type==='save')v.save.dc.formula='18';});},(a:any)=>{const first=Object.values(a.items[0].system.activities)[0] as any;first.damage.includeBase=true;a.items[0].system.damage={base:{number:2,denomination:12,types:['fire']}};},(a:any)=>{a.items[0].system.uses.max='4';}]){
      const changed=structuredClone(actor);mutate(changed);expect(verifyMonsterIntake(source,ir,markdown,changed).status).toBe('needs_review');
    }
    const invalid=structuredClone(ir);invalid.creature.actions[0]!.sourceOperations![0]!.evidence!.start=-1;expect(validateMonsterIntakeIR(source,invalid).blocking.some(f=>f.code==='UNBOUND_SOURCE_OPERATION_EVIDENCE')).toBe(true);
  });
  test('both source-explicit Attack modes exclude base damage in the typed verifier and native readback',async()=>{
    const feature=fixture.attack.replace('Melee Weapon Attack:','Melee or Ranged Weapon Attack:').replace('reach 5 ft.,','reach 5 ft. or range 20/60 ft.,'),source=header+'Actions\n'+feature+'\n';
    const {ir,markdown,actor}=await formal('attack',source,feature,ops=>{ops[0].attack.range=20;ops[0].attack.longRange=60;return ops;});const attacks=Object.values(actor.items[0].system.activities).filter((activity:any)=>activity.type==='attack') as any[];expect(attacks).toHaveLength(2);expect(attacks.map(activity=>activity.damage.includeBase)).toEqual([false,false]);
    for(const index of [0,1])for(const value of [true,undefined]){
      const changed=structuredClone(actor),attack=Object.values(changed.items[0].system.activities).filter((activity:any)=>activity.type==='attack')[index] as any;if(value===undefined)delete attack.damage.includeBase;else attack.damage.includeBase=value;changed.items[0].system.damage={base:{number:2,denomination:12,types:['fire']}};
      expect(verifyMonsterIntake(source,ir,markdown,changed).findings).toContainEqual(expect.objectContaining({code:'ACTOR_SOURCE_OPERATION_DAMAGE_DRIFT'}));expect(()=>assertActorSemantics(actor,changed)).toThrow('semantics');
    }
  });
  test('the new contract is consumed by the real offline encounter workflow',async()=>{
    const {source,ir}=await formal('attack'),forbidden=async():Promise<never>=>{throw Error('Offline contract forbids external providers');};
    const result=await generateEncounterFromHumanMarkdown({source,label:'Common source contract',reviewPolicy:'deferred',outputLanguage:'source',drafts:[{key:'actor-1',source,ir}],draftParentHash:hashSource(JSON.stringify(ir)),provider:{providerName:'offline',extractionModel:'test',reviewModel:'test',discover:forbidden,extract:forbidden,repair:forbidden,review:forbidden},automationProvider:{generate:forbidden,review:forbidden}});
    expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();expect((Object.values((result.prepared!.actors[0]!.artifact as any).items[0].system.activities) as any[]).map(activity=>activity.type)).toEqual(['attack','save']);
  });
  test('ordinary full-IR extraction and patch repair bind the same operations without model offsets',async()=>{
    const {source,ir}=await formal('attack'),raw=structuredClone(ir) as any;
    for(const op of raw.creature.actions[0].sourceOperations){delete op.evidence;delete op.sourceText;delete op.condition;delete op.failureStatuses;}
    delete raw.creature.actions[0].nativeRuleText;delete raw.creature.actions[0].manualRemainder;
    const prompts:string[]=[],provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'test-only',baseUrl:'https://offline.invalid/v1',model:'test',reviewModel:'test',timeoutMs:10000,repairTimeoutMs:10000,httpClient:async(_url,init)=>{
      const body=JSON.parse(init.body);prompts.push(body.messages[0].content);
      return{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(prompts.length===1?raw:{schemaVersion:1,operations:[{op:'replace',path:'/creature/actions/0/sourceOperations',value:raw.creature.actions[0].sourceOperations}]})}}]})};
    }});
    const extracted=await provider.extract(request(source));expect(validateMonsterIntakeIR(source,extracted).blocking).toEqual([]);
    const repaired=await provider.repair({stage:'deterministic-validation',source,ir:extracted,deterministicFindings:[]});expect(validateMonsterIntakeIR(source,repaired).blocking).toEqual([]);
    for(const prompt of prompts){expect(prompt).toContain('OP is {id:string');expect(prompt).toContain('sourceResourcePools');}
    for(const op of repaired.creature.actions[0]!.sourceOperations!)expect(source.slice(op.evidence!.start,op.evidence!.end)).toBe(op.sourceText);
  });
  test('ordinary IR cannot replace basic attacks and target-choice Saves with complete prose',async()=>{
    for(const kind of ['attack','choice']as const){
      const {source,ir}=await formal(kind),wrong=structuredClone(ir),feature=wrong.creature.actions[0]!;
      delete feature.sourceOperations;delete feature.nativeRuleText;delete feature.manualRemainder;feature.executionMode='gm-manual';feature.activityType='utility';
      expect(validateMonsterIntakeIR(source,wrong).blocking.some(finding=>finding.code==='SOURCE_BASIC_OPERATION_OMITTED')).toBe(true);
    }
  });
  for(const [label,recovery]of [['Barbed Spear (3/天)','day'],['Barbed Spear (Recharges after a Short Rest)','sr'],['Barbed Spear (3/Day)','dawn']]as const)test('source resource recovery stays distinct: '+recovery,async()=>{
    const feature=fixture.attack.replace('Barbed Spear (3/Day)',label)+(recovery==='dawn'?' It regains all expended uses at dawn.':''),{actor}=await formal('attack',header+'Actions\n'+feature+'\n',feature);
    expect(actor.items[0].system.uses).toMatchObject({max:recovery==='sr'?'1':'3',recovery:[{period:recovery,type:'recoverAll'}]});
  });
});

describe('independent source entailment rejects nearby wrong interpretations',()=>{
  test('a clipped conditional or negated damage cannot become unconditional',()=>{
    for(const source of ['If the target is prone, it takes 7 (2d6) cold damage.','The target takes no 7 (2d6) cold damage.']){
      const op={id:'wrong',name:'Wrong',type:'damage',relationship:'primary',sourceText:source,damage:[{formula:'2d6',type:'cold',relationship:'base'}],proof:{damage:['7 (2d6) cold damage.']}};
      expect(sourceOperationErrors(source,[op]).length).toBeGreaterThan(0);
      expect(sourceOperationErrors(source,[{...op,sourceText:source.slice(source.indexOf('7')),proof:{damage:[source]}}]).length).toBeGreaterThan(0);
    }
  });
  for(const predicate of ['cannot take',"doesn't take","can’t take","doesn’t take"] )test('damage negation stays scoped to its own predicate: '+predicate,()=>{
    const source=`The target ${predicate} 1d6 fire damage.`;
    expect(()=>bindSourceOperations(source,[{id:'wrong',name:'Wrong',type:'damage',relationship:'primary',damage:[{formula:'1d6',type:'fire',relationship:'base'}],proof:{damage:[source]}}])).toThrow();
  });
  test('DC and ability must belong to the same Save, not independent sets',()=>{
    const source='Make a DC 15 Strength saving throw or a DC 18 Dexterity saving throw.';
    const op={id:'wrong',name:'Wrong',type:'save',relationship:'primary',sourceText:source,save:{dc:18,abilities:['str'],choice:'single',outcome:'none'},proof:{save:source}};
    expect(sourceOperationErrors(source,[op])).toContain('0/save/dc-or-ability');
  });
  test('success damage cannot be dropped or borrowed from failure',()=>{
    const source=fixture.choice,ops=bindSourceOperations(source,operations('choice'));
    ops[0]!.save!.outcome='none';expect(sourceOperationErrors(source,ops)).toContain('0/save/outcome');
    const wrong=source.replace('or half as much damage on a successful one','and half damage on failure but no damage on success'),other=structuredClone(ops);other[0]!.sourceText=wrong;delete other[0]!.evidence;other[0]!.save!.outcome='half';other[0]!.proof.damage=[clauses(wrong)[2]!];expect(sourceOperationErrors(wrong,other)).toContain('0/save/outcome');
  });
  test('follow-up cannot consume twice and duplicate proof cannot duplicate damage',()=>{
    const ops=bindSourceOperations(fixture.attack,operations('attack'));
    ops[1]!.relationship='primary';expect(sourceOperationErrors(fixture.attack,ops)).toContain('1/relationship');
    const duplicate=structuredClone(ops[0]!);duplicate.id='copy';duplicate.relationship='alternative';expect(sourceOperationErrors(fixture.attack,[ops[0],duplicate])).toContain('1/duplicate-operation');
    const bad=structuredClone(ops[0]!);bad.damage!.push(structuredClone(bad.damage![0]!));bad.proof.damage!.push(bad.proof.damage![0]!);expect(sourceOperationErrors(fixture.attack,[bad]).some(e=>e.includes('duplicate-part'))).toBe(true);
  });
  test('AND is not target-choice OR and a leading movement is not Save range',()=>{
    const source=fixture.choice.replace('Intelligence or Wisdom','Intelligence and Wisdom'),ops=operations('choice',source) as SourceOperation[];
    expect(()=>bindSourceOperations(source,ops)).toThrow();
    const reverse=fixture.choice.replace('DC 16 Intelligence or Wisdom saving throw (the target chooses)','Intelligence and Wisdom Saving Throw: (Target’s Choice) DC 16');expect(()=>bindSourceOperations(reverse,operations('choice',reverse))).toThrow();
    const movement='The creature moves 30 feet. Each target makes a DC 12 Strength saving throw.';
    const op={id:'s',name:'s',type:'save',relationship:'primary',sourceText:movement,save:{dc:12,abilities:['str'],choice:'single',outcome:'none'},range:30,proof:{save:clauses(movement)[1],range:clauses(movement)[0]}};
    expect(sourceOperationErrors(movement,[op])).toContain('0/range');
  });
  test('an operation inventory cannot hide an explicit basic Save or damage in complete prose',()=>{
    const ops=bindSourceOperations(fixture.attack,operations('attack'));
    expect(sourceOperationErrors(fixture.attack,[ops[0]])).toContain('inventory/save-omitted');
    const less=structuredClone(ops);less[0]!.damage!.pop();less[0]!.proof.damage!.pop();expect(sourceOperationErrors(fixture.attack,less)).toContain('inventory/damage-omitted');
  });
  test('an independent conditional rider does not suppress the preceding unconditional hit',()=>{
    const source=fixture.attack.replace('piercing damage plus 3 (1d6) fire damage.','piercing damage plus 3 (1d6) fire damage, and if the target is large it falls prone.'),ops=operations('attack',source);
    expect(()=>bindSourceOperations(source,ops)).not.toThrow();
  });
  test('putting conditional damage on a primary attack cannot pass the source contract',()=>{
    const ops=operations('conditional') as any[],primary=structuredClone(ops[0]);
    primary.damage.push(...ops[1].damage);primary.proof.damage.push(...ops[1].proof.damage);
    expect(()=>bindSourceOperations(fixture.conditional,[primary])).toThrow('separate-gm-operation');
    const charged=structuredClone(ops);charged[1].relationship='alternative';expect(()=>bindSourceOperations(fixture.conditional,charged)).toThrow('separate-gm-operation');
    // The complete Actor positive case above exercises the independent GM
    // damage Activity; passing a condition string on an Attack is insufficient.
  });
});

describe('source-owned fallback partition',()=>{
  for(const newline of ['\n','\r\n'])test('the actual wrapped-label reply binds only complete contiguous printed labels: '+JSON.stringify(newline),()=>{
    const payload=JSON.parse(recordedProtocol.wrappedLabel.requestUserContent),source=payload.lines.map((line:{text:string})=>line.text).join('').replace(/\r?\n/gu,newline),raw=JSON.parse(recordedProtocol.wrappedLabel.content),before=JSON.stringify(raw),plan=assembleStagedLinePartition(request(source),raw);
    expect(plan.units.map(unit=>unit.quote).join('')).toBe(source);expect(plan.features).toHaveLength(7);expect(plan.features.map(unit=>unit.name)).toEqual(raw.units.filter((unit:any)=>unit.destination==='feature').map((unit:any)=>unit.name));expect(plan.features.find(unit=>unit.id==='unit-2')!.quote).toContain('Unusual'+newline+'Nature');expect(plan.features.find(unit=>unit.id==='unit-7')!.quote).toContain('Lightning'+newline+'Jolt');expect(plan.features.find(unit=>unit.id==='unit-8')!.quote).toContain('Helm'+newline+'Interface');expect(JSON.stringify(raw)).toBe(before);
    const invented=structuredClone(raw);invented.units[2].name+=' Extra';expect(()=>assembleStagedLinePartition(request(source),invented)).toThrow('SOURCE_LINE_LABEL');
    const body=structuredClone(raw);body.units[2].name+='。发条恐怪不需要呼吸、饮食或睡眠';expect(()=>assembleStagedLinePartition(request(source),body)).toThrow('SOURCE_LINE_LABEL');
    const blank=source.replace('Unusual'+newline+'Nature','Unusual'+newline+newline+'Nature');expect(()=>assembleStagedLinePartition(request(blank),raw)).toThrow('SOURCE_LINE_LABEL');
    const heading=source.replace('非寻常天性 Unusual','动作Actions'),crossed=structuredClone(raw);crossed.units[2].name='动作Actions Nature';expect(()=>assembleStagedLinePartition(request(heading),crossed)).toThrow('SOURCE_LINE_LABEL');
  });
  test('the actual line-ID reply binds missing context sections from exact source headings',()=>{
    const payload=JSON.parse(recordedProtocol.partition.requestUserContent),source=payload.lines.map((line:{text:string})=>line.text).join(''),req=request(source),raw=JSON.parse(recordedProtocol.partition.content),before=JSON.stringify(raw);
    expect(recordedProtocol.partition.recordedFailure).toEqual({code:'SOURCE_LINE_CONTEXT',path:'/units/1'});expect(raw.units.filter((unit:any)=>unit.destination==='context').every((unit:any)=>!Object.hasOwn(unit,'section'))).toBe(true);
    const plan=assembleStagedLinePartition(req,raw);expect(plan.units.map(unit=>unit.quote).join('')).toBe(source);expect(plan.units.filter(unit=>unit.destination==='context').map(unit=>unit.section)).toEqual(['trait','action','bonus','reaction']);expect(plan.features).toHaveLength(8);expect(JSON.stringify(raw)).toBe(before);
    const wrong=structuredClone(raw);wrong.units[1].section='bonus';expect(()=>assembleStagedLinePartition(req,wrong)).toThrow('SOURCE_LINE_CONTEXT');
    const foreign=structuredClone(raw);foreign.units[2].section='bonus';expect(()=>assembleStagedLinePartition(req,foreign)).toThrow('SOURCE_LINE_CONTEXT_SECTION');
    const noHeading=source.replace('特质 Traits','正文 Narrative');expect(()=>assembleStagedLinePartition(request(noHeading),raw)).toThrow('SOURCE_LINE_CONTEXT');
  });
  test('the layout provider receipt carries the original source hash without copying source into line payload',async()=>{
    const payload=JSON.parse(recordedProtocol.partition.requestUserContent),source=payload.lines.map((line:{text:string})=>line.text).join(''),controller=new AbortController(),events:any[]=[],requests:any[]=[];
    const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline-test',baseUrl:'https://offline.invalid/v1',model:'test',reviewModel:'test',timeoutMs:10000,repairTimeoutMs:10000,maxAttempts:1,responseEvidence:{record:event=>{events.push(event);}},stagedExtraction:{baseMode:'facts',featureMode:'auto',signal:controller.signal,onStage:event=>{if(event.stage==='source'&&event.status==='validated')controller.abort();}},httpClient:async(_url,init)=>{requests.push(JSON.parse(init.body));return{ok:true,status:200,json:async()=>({choices:[{message:{content:recordedProtocol.partition.content}}]})};}});
    await expect(provider.extract(request(source))).rejects.toThrow();expect(requests).toHaveLength(1);expect(events).toHaveLength(1);expect(events[0].sourceHash).toBe(hashSource(source));expect(events[0].sourceHash).not.toBe(hashSource(''));expect(JSON.parse(requests[0].messages[1].content).source).toBeUndefined();expect(requests[0].messages[0].content).toContain('program derives its section');
  });
  test('line IDs map full coverage and cannot omit, overlap or invent labels',()=>{
    const source=header+'Actions\nOddity: The target must make a DC 13 Wisdom saving throw.\n',req=request(source),lines=stagedSourceLines(req),action=lines.findIndex(line=>line.text.trim()==='Actions');
    const value={schemaVersion:1,units:[{firstLine:0,lastLine:action-1,destination:'base'},{firstLine:action,lastLine:action,destination:'context',section:'action'},{firstLine:action+1,lastLine:lines.length-1,destination:'feature',section:'action',name:'Oddity'}]};
    const plan=assembleStagedLinePartition(req,value);expect(plan.units.map(unit=>unit.quote).join('')).toBe(source);expect(plan.features[0]!.name).toBe('Oddity');
    const overlap=structuredClone(value);overlap.units[2]!.firstLine=action;expect(()=>assembleStagedLinePartition(req,overlap)).toThrow('SOURCE_LINE_COVERAGE');
    const invented=structuredClone(value);invented.units[2]!.name='Invented';expect(()=>assembleStagedLinePartition(req,invented)).toThrow('SOURCE_LINE_LABEL');
  });
  test('unknown Chinese mechanics receive full feature fallback and manual cannot erase known attack',async()=>{
    const source=header+'Actions\n'+fixture.attack+'\n',seen:Record<string,unknown>[]=[];
    const ir=await runStagedMonsterExtraction(request(source),async call=>{seen.push(call.payload);await call.onAttempt(1);return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{schemaVersion:1,unitId:call.unitId,mode:'manual',facts:{}};},{baseMode:'facts',featureMode:'auto'});
    expect(seen.some(payload=>payload.unitId&&payload.verifiedFacts)).toBe(true);expect(ir.creature.actions[0]!.attack).toMatchObject({toHit:6});
  });
});

describe('actual first-attempt protocol failures replay without changing the raw model data',()=>{
  const saved=recordedProtocol.operations,step=JSON.parse(saved.content),source=saved.unitSource;
  test('missing redundant target proof is distinct from an explicit incorrect target or proof',()=>{
    const original=saved.content,raw=step.facts.sourceOperations.map((op:any)=>({...op,sourceText:source.trim(),...(op.relationship==='follow-up'?{condition:source.trim()}:{})}));
    expect(sourceOperationErrors(source,raw)).toContain('0/proof/target');expect(sourceOperationErrors(source,raw)).toContain('0/targetSpecial');
    const bound=bindSourceOperations(source,step.facts.sourceOperations);expect(bound[0]!.proof.target).toBe(bound[0]!.proof.attack);expect(bound.map(op=>op.type)).toEqual(['attack','damage','save']);expect(bound[1]!.damage![0]!.formula).toBe('2d6');expect(saved.content).toBe(original);expect(step.facts.sourceOperations[0].proof.target).toBeUndefined();
    const wrong=structuredClone(step.facts.sourceOperations);wrong[0].proof.target='Hit: 7 (2d6) necrotic damage.';expect(()=>bindSourceOperations(source,wrong)).toThrow('targetSpecial');
    const falseTarget=structuredClone(step.facts.sourceOperations);falseTarget[0].targetSpecial='two creatures';expect(()=>bindSourceOperations(source,falseTarget)).toThrow('proof/target');
    const falseAttack=structuredClone(step.facts.sourceOperations);falseAttack[0].attack.toHit=99;expect(()=>bindSourceOperations(source,falseAttack)).toThrow('attack/type-or-bonus');
    const clipped=structuredClone(step.facts.sourceOperations);clipped[0].proof.attack='one creature.';expect(()=>bindSourceOperations(source,clipped)).toThrow('clause-boundary');
    const ambiguous=source.replace('one creature.','one creature or one creature.'),duplicated=structuredClone(step.facts.sourceOperations);duplicated[0].proof.attack=duplicated[0].proof.attack.replace('one creature.','one creature or one creature.');expect(()=>bindSourceOperations(ambiguous,duplicated)).toThrow('proof/target');
  });
  test('ordinary complete Actors also bind that redundant proof without guessing a target',async()=>{
    const {actor}=await formal('attack',undefined,undefined,ops=>{ops[0].targetSpecial='one target';return ops;});
    expect((Object.values(actor.items[0].system.activities)[0] as any).target.affects.special).toBe('one target');
  });
  test('the original recorded prefix including a manual spell reply retains five real refs and two independent spell pools',async()=>{
    const recorded=new Map([JSON.parse(saved.spellContent),JSON.parse(saved.saveContent),JSON.parse(saved.content)].map(value=>[value.unitId,value])),seen:string[]=[];
    const ir=await runStagedMonsterExtraction(request(saved.source),async call=>{
      await call.onAttempt(1);seen.push(call.stage+':'+call.unitId);if(call.stage==='base')return JSON.parse(saved.baseContent);
      const actual=recorded.get(call.unitId);if(actual)return structuredClone(actual);
      // The first attempt stopped at the recorded prefix. These remaining two
      // replies are test-authored from its source, never claimed as model data.
      const c=clauses(String(call.payload.source));
      const ops=call.unitId==='unit-5'?[{id:'save',name:'Choice Save',type:'save',relationship:'primary',save:{dc:16,abilities:['int','wis'],choice:'target',outcome:'half'},damage:[{formula:'2d6',type:'psychic',relationship:'base'}],aoe:{shape:'cone',radius:30},proof:{save:c[1],damage:[c[2]],aoe:c[1]}}]:[{id:'attack',name:'Attack',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:6,reach:5},damage:[{formula:'1d8+3',type:'piercing',relationship:'base'}],proof:{attack:c[1],damage:[c[2]]}},{id:'rider',name:'Conditional damage (GM)',type:'damage',relationship:'follow-up',damage:[{formula:'2d6',type:'cold',relationship:'conditional'}],proof:{damage:[c[3]]}}];
      return{schemaVersion:1,unitId:call.unitId,mode:'native-with-gm',facts:{sourceOperations:ops}};
    },{baseMode:'facts',featureMode:'model'});
    expect(seen).toHaveLength(6);expect(JSON.parse(saved.spellContent).mode).toBe('manual');expect(validateMonsterIntakeIR(saved.source,ir).blocking).toEqual([]);
    const manualOnly=structuredClone(ir),spell=JSON.parse(saved.requestUserContent).sourceInventory[0].source,start=saved.source.indexOf(spell);delete manualOnly.creature.spellcasting;manualOnly.creature.traits.push({name:'Spellcasting',description:spell.trim(),executionMode:'gm-manual',activityType:'utility',evidence:[{start,end:start+spell.length,quote:spell}]});expect(validateMonsterIntakeIR(saved.source,manualOnly).blocking.some(finding=>finding.code==='SPELLCASTING_NOT_STRUCTURED')).toBe(true);
    const groups=ir.creature.spellcasting!;expect(groups).toHaveLength(2);expect(groups.flatMap(group=>group.usageGroups).filter(usage=>usage.usage==='daily-shared').map(usage=>'count'in usage?usage.count:0)).toEqual([1,2]);expect(groups.flatMap(group=>group.usageGroups.flatMap(usage=>usage.spellRefs))).toHaveLength(5);
    const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(markdown)) as any;expect(verifyMonsterIntake(saved.source,ir,markdown,actor).findings.filter(f=>f.blocking)).toEqual([]);
    expect(actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs)).toHaveLength(5);
    const item=actor.items.find((item:any)=>item.flags.fvttJsonGenerator?.manualRule?.sourceText===source.trim()),activities=Object.values(item.system.activities) as any[];expect(activities.map(activity=>activity.type)).toEqual(['attack','damage','save']);expect(activities[0].consumption.targets).toHaveLength(1);expect(activities.slice(1).every(activity=>activity.activation.type==='special'&&activity.consumption.targets.length===0)).toBe(true);
    const forbidden=async():Promise<never>=>{throw Error('No external calls in recorded-prefix replay');};
    const result=await generateEncounterFromHumanMarkdown({source:saved.source,label:'Recorded prefix with test-authored remainder',reviewPolicy:'deferred',outputLanguage:'source',drafts:[{key:'actor-1',source:saved.source,ir}],draftParentHash:hashSource(JSON.stringify(ir)),provider:{providerName:'saved-prefix',extractionModel:'recorded',reviewModel:'recorded',discover:forbidden,extract:forbidden,repair:forbidden,review:forbidden},automationProvider:{generate:forbidden,review:forbidden}});expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
  });
  test('a conflicting explicit proof keeps the existing safe stage diagnostic without leaking model values',async()=>{
    const broken=structuredClone(step);broken.facts.sourceOperations[0].proof.target='Hit: 7 (2d6) necrotic damage.';const replies=[saved.baseContent,saved.spellContent,saved.saveContent,JSON.stringify(broken)];let calls=0;
    const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'private-fixture-key',baseUrl:'https://offline.invalid/v1',model:'test',reviewModel:'test',timeoutMs:10000,repairTimeoutMs:10000,maxAttempts:1,stagedExtraction:{baseMode:'facts',featureMode:'model'},httpClient:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:replies[calls++]}}]})})});
    try{await provider.extract(request(saved.source));throw Error('Expected source contract rejection');}catch(error){expect(error).toBeInstanceOf(MonsterIntakeProviderError);const failure=error as MonsterIntakeProviderError;expect(failure.stagedDiagnostic).toEqual({stage:'response',code:'FEATURE_FACT_CONFLICT',path:'/features/unit-4/facts/sourceOperations/0/targetSpecial'});expect(failure.diagnosticMessage).toBe('FEATURE_FACT_CONFLICT at /features/unit-4/facts/sourceOperations/0/targetSpecial');expect(failure.diagnosticMessage).not.toContain('private-fixture-key');expect(failure.diagnosticMessage).not.toContain('necrotic');}expect(calls).toBe(4);
  });
  for(const wording of ['does not cast one of the following spells','cannot normally cast one of the following spells','does not normally cast one of the following spells','cannot speak or cast one of the following spells','cannot speak or\ncast one of the following spells','cannot speak or\r\ncast one of the following spells','cannot speak or\n\ncast one of the following spells','cannot speak and cast one of the following spells','does not speak or normally cast one of the following spells','casts no spells'])test('a negative casting statement cannot create a spell manifest: '+wording,async()=>{
    const inventory=JSON.parse(saved.requestUserContent).sourceInventory,spell=inventory[0].source.replace('casts one of the following spells',wording),input=header+spell+'\nActions\nQuiet Rule. The creature watches nearby objects.\n';
    const ir=await runStagedMonsterExtraction(request(input),async call=>{await call.onAttempt(1);return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{schemaVersion:1,unitId:call.unitId,mode:'manual',facts:{}};},{baseMode:'facts',featureMode:'auto'});
    expect(ir.creature.spellcasting??[]).toEqual([]);expect(validateMonsterIntakeIR(input,ir).blocking).toEqual([]);const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(renderMonsterIntakeMarkdown(ir))) as any;expect(actor.flags?.['fvtt-json-generator-spell-resolver']).toBeUndefined();
  });
  test('a quoted casting list in biography remains source prose without a spell manifest',async()=>{
    const spell=JSON.parse(saved.requestUserContent).sourceInventory[0].source,input=header+'"'+spell.trim()+'"\n\nActions\nQuiet Rule. The creature watches nearby objects.\n';
    const ir=await runStagedMonsterExtraction(request(input),async call=>{await call.onAttempt(1);return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{schemaVersion:1,unitId:call.unitId,mode:'manual',facts:{}};},{baseMode:'facts',featureMode:'auto'});
    expect(ir.creature.spellcasting??[]).toEqual([]);expect(ir.creature.biography).toContain(spell.trim());const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(renderMonsterIntakeMarkdown(ir))) as any;expect(actor.flags?.['fvtt-json-generator-spell-resolver']).toBeUndefined();
  });
  for(const wording of ['cannot normally cast','doesn’t normally cast','can’t usually cast','cannot speak or cast','cannot speak or\ncast','cannot speak or\r\ncast','cannot speak and cast'])test('single-spell casting uses the same negative predicate scope: '+wording,async()=>{
    const input=header+'Actions\nQuiet Magic. The creature '+wording+' Alarm, using Wisdom as its spellcasting ability.\n',ir=await runStagedMonsterExtraction(request(input),async call=>{await call.onAttempt(1);return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{schemaVersion:1,unitId:call.unitId,mode:'manual',facts:{}};},{baseMode:'facts',featureMode:'auto'});
    expect(ir.creature.spellcasting??[]).toEqual([]);const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(renderMonsterIntakeMarkdown(ir))) as any;expect(actor.flags?.['fvtt-json-generator-spell-resolver']).toBeUndefined();
  });
  test('a separate coordinated negative predicate does not cancel a real single-spell grant',async()=>{
    const input=header+'Actions\nQuiet Magic. The creature cannot speak, but casts Alarm, using Wisdom as its spellcasting ability.\n',ir=await runStagedMonsterExtraction(request(input),async call=>{await call.onAttempt(1);return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{schemaVersion:1,unitId:call.unitId,mode:'manual',facts:{}};},{baseMode:'facts',featureMode:'auto'});
    const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(renderMonsterIntakeMarkdown(ir))) as any;expect(actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs).map((ref:any)=>ref.identifier)).toEqual(['alarm']);
  });
});

describe('referenced existing attacks keep their original button and local evidence boundary',()=>{
  test('the recorded borrowed Attack/damage reply remains invalid instead of being erased into manual',()=>{
    const data=recordedProtocol.referencedAttack,plan=assembleStagedLinePartition(request(data.source),JSON.parse(data.layoutContent)),raw=JSON.parse(data.content),unit=plan.features.find(unit=>unit.id===raw.unitId)!,before=JSON.stringify(raw);
    expect(unit.quote).toBe(JSON.parse(data.requestUserContent).source);expect(()=>assembleStagedFeature(plan,unit,raw)).toThrow('FEATURE_FACT_CONFLICT');
    const issues=sourceOperationErrors(unit.quote,raw.facts.sourceOperations.map((op:any)=>({...op,sourceText:unit.quote.trim()})));expect(issues).toContain('0/attack/type-or-bonus');expect(issues).toContain('0/proof/damage/0');expect(JSON.stringify(raw)).toBe(before);
    const manual=assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}});expect(manual.executionMode).toBe('gm-manual');expect(sourceFeatureBasicOmissions(unit.quote,manual)).toEqual([]);expect(manual.description).toContain('发动一次矛攻击');
    const direct=plan.features.find(unit=>unit.id==='unit-6')!,retained=assembleStagedFeature(plan,direct,{schemaVersion:1,unitId:direct.id,mode:'manual',facts:{}});expect(sourceFeatureBasicOmissions(direct.quote,retained)).toContain('attack');
  });
  test('recorded CHM prefix plus an explicit test-authored manual reference keeps the original Spear attack and true spells',async()=>{
    const data=recordedProtocol.referencedAttack,replies=new Map(data.featureContents.map(content=>{const value=JSON.parse(content);return[value.unitId,value];})),plan=assembleStagedLinePartition(request(data.source),JSON.parse(data.layoutContent)),base=validateStagedBaseFacts(plan,JSON.parse(data.baseContent)),ir=assembleStagedMonsterIntake(plan,base,plan.features.map(unit=>replies.get(unit.id)??{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}}));
    expect(validateMonsterIntakeIR(data.source,ir).blocking).toEqual([]);const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(markdown)) as any;expect(verifyMonsterIntake(data.source,ir,markdown,actor).findings.filter(f=>f.blocking)).toEqual([]);
    const reference=ir.creature.reactions[0]!,item=actor.items.find((item:any)=>item.name===reference.name);expect(Object.values(item.system.activities).map((activity:any)=>activity.type)).toEqual(['utility']);expect(item.system.description.value).toContain('发动一次矛攻击');expect(item.effects).toEqual([]);
    const spear=actor.items.find((item:any)=>item.name.includes('Spear'));expect(Object.values(spear.system.activities).some((activity:any)=>activity.type==='attack'&&activity.attack.bonus==='8')).toBe(true);expect(actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs)).toHaveLength(2);
  });
});

describe('locked native Activity damage schema and strict readback',()=>{
  test('the real r3 formal source regenerates schema-correct Save/Damage without changing its damage parts',()=>{
    const data=recordedProtocol.nativeActivitySchema,actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(data.formalSource)) as any,native=structuredClone(actor);
    for(const recorded of data.recordedOperations){
      const item=actor.items.find((item:any)=>item.flags?.fvttJsonGenerator?.manualRule?.logicalPath===recorded.logicalPath);expect(item,JSON.stringify({expected:recorded.logicalPath,actual:actor.items.map((item:any)=>({name:item.name,path:item.flags?.fvttJsonGenerator?.manualRule?.logicalPath}))})).toBeDefined();const activity=Object.values(item.system.activities).find((activity:any)=>activity.flags?.fvttJsonGenerator?.sourceOperation?.id===recorded.operationId) as any,expected=structuredClone(recorded.damage) as any;expect(activity.type).toBe(recorded.type);
      if(recorded.type==='attack')expect(activity.damage.includeBase).toBe(false);else{expect(expected.includeBase).toBe(false);delete expected.includeBase;expect(Object.hasOwn(activity.damage,'includeBase')).toBe(false);}expect(activity.damage).toEqual(expected);
      const projectedItem=native.items.find((entry:any)=>entry.flags?.fvttJsonGenerator?.manualRule?.logicalPath===recorded.logicalPath),projected=Object.values(projectedItem.system.activities).find((entry:any)=>entry.flags?.fvttJsonGenerator?.sourceOperation?.id===recorded.operationId) as any;if(recorded.type==='save')projected.damage={onSave:activity.damage.onSave,parts:structuredClone(activity.damage.parts)};else if(recorded.type==='damage')projected.damage={critical:structuredClone(activity.damage.critical),parts:structuredClone(activity.damage.parts)};
    }
    expect(()=>assertActorSemantics(actor,native)).not.toThrow();
    for(const type of ['save','damage','attack'])for(const value of [false,true]){
      if(type==='attack'&&value===false)continue;const changed=structuredClone(native),activity=changed.items.flatMap((item:any)=>Object.values(item.system.activities??{})).find((activity:any)=>activity.type===type) as any;activity.damage.includeBase=value;expect(()=>assertActorSemantics(actor,changed)).toThrow('semantics');
    }
    const missing=structuredClone(native),attack=missing.items.flatMap((item:any)=>Object.values(item.system.activities??{})).find((activity:any)=>activity.type==='attack') as any;delete attack.damage.includeBase;expect(()=>assertActorSemantics(actor,missing)).toThrow('semantics');
  });
  test('the typed verifier rejects non-native includeBase values as well as Attack double-base drift',async()=>{
    for(const kind of ['choice','conditional'] as const){const {source,ir,markdown,actor}=await formal(kind);for(const value of [false,true]){const changed=structuredClone(actor),activity=Object.values(changed.items[0].system.activities).find((activity:any)=>activity.type!=='attack') as any;activity.damage.includeBase=value;expect(verifyMonsterIntake(source,ir,markdown,changed).status).toBe('needs_review');}}
  });
});

test('ordinary declared spell groups also require a non-negated source grant',async()=>{
  const phrase='casts one of the following spells',source=header+'Spellcasting. The creature '+phrase+', using Wisdom as the spellcasting ability.\nAt Will: Light\nActions\nQuiet Rule. The creature watches.\n',ir=await runStagedMonsterExtraction(request(source),async call=>{await call.onAttempt(1);return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{schemaVersion:1,unitId:call.unitId,mode:'manual',facts:{}};},{baseMode:'facts',featureMode:'source'});
  expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);expect(ir.creature.spellcasting).toHaveLength(1);
  for(const replacement of ['cannot normally cast one of the following spells','cannot speak or\ncast one of the following spells','cannot speak or\r\ncast one of the following spells']){
    const start=source.indexOf(phrase),end=start+phrase.length,delta=replacement.length-phrase.length,changedSource=source.replace(phrase,replacement),shift=(offset:number)=>offset<=start?offset:offset>=end?offset+delta:(()=>{throw Error('Test evidence boundary inside replaced predicate');})();
    const visit=(value:any):any=>{if(typeof value==='string')return value.replaceAll(phrase,replacement);if(Array.isArray(value))return value.map(visit);if(!value||typeof value!=='object')return value;const next=Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,visit(entry)]));if(typeof value.start==='number'&&typeof value.end==='number'&&typeof value.quote==='string'){next.start=shift(value.start);next.end=shift(value.end);expect(changedSource.slice(next.start,next.end)).toBe(next.quote);}return next;};
    const changed=visit(ir);changed.source={sha256:hashSource(changedSource),length:changedSource.length};const blockers=validateMonsterIntakeIR(changedSource,changed).blocking;expect(blockers).toContainEqual(expect.objectContaining({code:'NON_POSITIVE_SPELL_GRANT',path:'/creature/spellcasting/0/usageGroups'}));
    for(const fragment of ['At Will: Light','using Wisdom as the spellcasting ability.\nAt Will: Light']){
      const shortened=structuredClone(changed),group=shortened.creature.spellcasting[0],start=changedSource.indexOf(fragment);group.description=fragment;group.evidence=[{start,end:start+fragment.length,quote:fragment}];
      const findings=validateMonsterIntakeIR(changedSource,shortened).blocking;expect(findings).toContainEqual(expect.objectContaining({code:'NON_POSITIVE_SPELL_GRANT',path:'/creature/spellcasting/0/usageGroups'}));
    }
  }
});

test('spell parent polarity is independent for each source ability',async()=>{
  const phrase='casts one of the following spells',replacement='cannot normally cast one of the following spells',source=header+'**First Magic.** The creature casts the following spells, using Wisdom as the spellcasting ability.\nAt Will: Light\n\n**Second Magic.** The creature '+phrase+', using Wisdom as the spellcasting ability.\nAt Will: Alarm\n\nActions\nQuiet Rule. The creature watches.\n';
  const ir=await runStagedMonsterExtraction(request(source),async call=>{await call.onAttempt(1);return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{schemaVersion:1,unitId:call.unitId,mode:'manual',facts:{}};},{baseMode:'facts',featureMode:'source'});expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);expect(ir.creature.spellcasting).toHaveLength(2);
  const start=source.indexOf(phrase),end=start+phrase.length,delta=replacement.length-phrase.length,changedSource=source.replace(phrase,replacement),shift=(offset:number)=>offset<=start?offset:offset>=end?offset+delta:(()=>{throw Error('Evidence boundary inside replacement');})();
  const visit=(value:any):any=>{if(typeof value==='string')return value.replaceAll(phrase,replacement);if(Array.isArray(value))return value.map(visit);if(!value||typeof value!=='object')return value;const next=Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,visit(entry)]));if(typeof value.start==='number'&&typeof value.end==='number'&&typeof value.quote==='string'){next.start=shift(value.start);next.end=shift(value.end);expect(changedSource.slice(next.start,next.end)).toBe(next.quote);}return next;};
  const changed=visit(ir);changed.source={sha256:hashSource(changedSource),length:changedSource.length};const findings=validateMonsterIntakeIR(changedSource,changed).blocking.filter(finding=>finding.code==='NON_POSITIVE_SPELL_GRANT');expect(findings.map(finding=>finding.path)).toEqual(['/creature/spellcasting/1/usageGroups']);
  changed.creature.spellcasting[1].abilityEvidence=structuredClone(changed.creature.spellcasting[0].abilityEvidence);expect(validateMonsterIntakeIR(changedSource,changed).blocking).toContainEqual(expect.objectContaining({code:'NON_POSITIVE_SPELL_GRANT',path:'/creature/spellcasting/1/usageGroups'}));
});

test('Chinese implicit each cadence yields to explicit shared ownership and preserves contradictory-label rejection',()=>{
  expect(dailySpellGrantLabel('1次/每日：light，alarm')).toMatchObject({count:1,each:true,shared:false});
  expect(dailySpellGrantLabel('共享1次/每日：light，alarm')).toMatchObject({count:1,each:false,shared:true});
  expect(dailySpellGrantLabel('1/Day: light, alarm')).toMatchObject({count:1,each:false,shared:false});
  expect(()=>dailySpellGrantLabel('共享每项1次/每日：light，alarm')).toThrow('CONFLICTING_SOURCE_SPELL_SHARING');
});


describe('source-bound cylinder geometry and contextual GM operations',()=>{
  for(const id of ['r13m-srd52-storm-giant-lightning-storm','r13r-lands-aid'])test('preserves the complete frozen failed parent: '+id,()=>{
    const parent=(roundFourRules.cases as any[]).find(c=>c.id===id),before=JSON.stringify(parent),f=parent.features[0],bound=bindSourceOperations(f.text,f.operations);
    expect(sourceOperationErrors(f.text,bound)).toEqual([]);expect(JSON.stringify(parent)).toBe(before);
    for(const op of bound){expect(op.sourceText).toBe(f.text);expect(op.evidence!.quote).toBe(f.text);expectSourceOperationProof(parent.source,op);}
  });
  test('a Cylinder radius is proven separately from its height and placement range',()=>{
    for(const [radius,height,range]of [[10,40,500],[12,55,300]] as const)for(const dimensions of [`${radius}-foot-radius, ${height}-foot-high Cylinder`,`${height}-foot-high, ${radius}-foot-radius Cylinder`,`${radius}-foot-radius Cylinder`,`Cylinder with a radius of ${radius} feet and a height of ${height} feet`,`${radius}尺圆柱形`,`半径${radius}尺、高${height}尺的圆柱形`]){
      const save=`Dexterity Saving Throw: DC 18, each creature in a ${dimensions} originating from a point within ${range} feet.`,hit='Failure: 10d10 Lightning damage.',source='Field. '+save+' '+hit+' Success: Half damage.',op:any={id:'field',name:'Field',type:'save',relationship:'primary',save:{dc:18,abilities:['dex'],choice:'single',outcome:'half'},range,aoe:{shape:'cylinder',radius},damage:[{formula:'10d10',type:'lightning',relationship:'base'}],proof:{save,range:save,aoe:save,damage:[hit]}};
      expect(sourceOperationErrors(source,auditBoundSourceOperations(source,[op]))).toEqual([]);
      for(const invalidRadius of [1,height,range,radius*10+1]){const wrong=structuredClone(op);wrong.aoe.radius=invalidRadius;expect(()=>auditBoundSourceOperations(source,[wrong])).toThrow('/aoe');}
      for(const invalidRange of [radius,height]){const wrong=structuredClone(op);wrong.range=invalidRange;expect(()=>auditBoundSourceOperations(source,[wrong])).toThrow('/range');}
      const wrongShape=structuredClone(op);wrongShape.aoe.shape='sphere';expect(()=>auditBoundSourceOperations(source,[wrongShape])).toThrow('/aoe');
    }
    for(const dimensions of ['40-foot-high Cylinder','Cylinder originating from a point within 500 feet']){
      const q=`Each creature in a ${dimensions} must make a DC 18 Dexterity saving throw.`,op:any={id:'field',name:'Field',type:'save',relationship:'primary',save:{dc:18,abilities:['dex'],choice:'single',outcome:'none'},aoe:{shape:'cylinder',radius:500},proof:{save:q,aoe:q}};
      expect(()=>auditBoundSourceOperations('Field. '+q,[op])).toThrow('/aoe');
    }
  });
  const conditional=(q:string,formula='2d6',type='fire'):any=>({id:'damage',name:'GM conditional damage',type:'damage',relationship:'follow-up',damage:[{formula,type,relationship:'conditional'}],proof:{damage:[q]}});
  test('an unfixed-DC result owns the conditional roll without inventing a Save or unconditional damage',()=>{
    const q='Each chosen creature must make a Constitution saving throw against your spell save DC, taking 2d6 Fire damage on a failed save or half as much damage on a successful one.',source='Pulse. '+q,op=conditional(q),bound=bindSourceOperations(source,[op]);
    expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.condition).toBe(source);expect(bound[0]!.save).toBeUndefined();expect(bound[0]!.damage![0]!.condition).toBe(source);
    const unconditional=structuredClone(op);unconditional.relationship='primary';unconditional.damage[0].relationship='base';expect(()=>bindSourceOperations(source,[unconditional])).toThrow('result-branch-condition');
    const invented:any={id:'save',name:'Invented fixed DC',type:'save',relationship:'primary',save:{dc:15,abilities:['con'],choice:'single',outcome:'half'},damage:[{formula:'2d6',type:'fire',relationship:'base'}],proof:{save:q,damage:[q]}};expect(()=>bindSourceOperations(source,[invented])).toThrow('save/dc-or-ability');
    const partial=structuredClone(op);partial.condition=q;const restored=bindSourceOperations(source,[partial]);expect(restored[0]!.condition).toBe(source);expect(restored[0]!.damage![0]!.condition).toBe(source);
    const shortened=structuredClone(op);shortened.sourceText=q;expect(()=>bindSourceOperations(source,[shortened])).toThrow('/sourceText');
    const ordinary='The creature takes 2d6 Fire damage.';expect(()=>bindSourceOperations('Pulse. '+ordinary,[conditional(ordinary)])).toThrow('relationship');
    const clipped=structuredClone(op);clipped.proof.damage=['taking 2d6 Fire damage on a failed save'];expect(()=>bindSourceOperations(source,[clipped])).toThrow('clause-boundary');
    expect(()=>bindSourceOperations(source,[op,{...structuredClone(op),id:'copy'}])).toThrow('duplicate-part');expect(()=>bindSourceOperations(source,[])).toThrow('operations');
  });
  test('relative depth conditions bind only to their immediate positive measured antecedent',()=>{
    for(const depth of [450,900]){
      const previous=`It can descend to a depth of ${depth} feet.`,q='Below that, the vehicle takes 2d6 Bludgeoning damage each minute from pressure.',source='Depth. '+previous+' '+q,op=conditional(q,'2d6','bludgeoning'),bound=bindSourceOperations(source,[op]);
      expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.condition).toBe(source);expect(bound[0]!.damage![0]!.condition).toBe(source);
    }
    const q='Below that, the vehicle takes 2d6 Bludgeoning damage each minute from pressure.';
    for(const previous of ['Its Armor Class is 900.','It cannot descend to a depth of 900 feet.','It can descend to a depth of 900 feet. Other Rule.'])expect(()=>bindSourceOperations('Depth. '+previous+' '+q,[conditional(q,'2d6','bludgeoning')])).toThrow('relationship');
    const mitigation='Below that, reduce the damage by 2d6 Bludgeoning damage each minute.';expect(()=>bindSourceOperations('Depth. It can descend to a depth of 900 feet. '+mitigation,[conditional(mitigation,'2d6','bludgeoning')])).toThrow();
  });
  test('mitigation never becomes outgoing damage and cannot hide a later real output',()=>{
    const mitigation='When you are hit, reduce the damage by 2d6 Cold damage.',source='Guard. '+mitigation;
    expect(sourceFeatureBasicOmissions(source,{name:'Guard',description:source,executionMode:'gm-manual',activityType:'utility'} as any)).toEqual([]);expect(()=>bindSourceOperations(source,[conditional(mitigation,'2d6','cold')])).toThrow('negation-or-binding');
    const mixed='When you are hit, reduce the damage by 2d6 Cold damage, and the attacker takes 1d6 Fire damage.',actual='Guard. '+mixed;
    expect(sourceOperationErrors(actual,bindSourceOperations(actual,[conditional(mixed,'1d6','fire')]))).toEqual([]);expect(()=>bindSourceOperations(actual,[conditional(mixed,'2d6','cold')])).toThrow('negation-or-binding');
  });
  const relativeMitigation=[
    ...['reduce','prevent','absorb'].flatMap(verb=>[
      `${verb} the damage it takes by `,
      `${verb} the incoming damage that the target would receive by `,
      `${verb} all damage the creature suffers from an attacker within 30 feet by `,
    ]),
    ...['reduced','prevented','absorbed'].map(verb=>`the damage it takes is ${verb} by `),
    'reduce the damage, which the creature takes, by ',
    'reduce the damage you and your allies take by ',
    'reduce the damage it receives from a source within 30 ft. by ',
  ];
  test.each(relativeMitigation)('relative mitigation objects do not replace the main input predicate: %s',phrase=>{
    const q='When the creature is hit, '+phrase+'2d6 Cold damage.',source='Guard. '+q;
    expect(sourceFeatureBasicOmissions(source,{name:'Guard',description:source,executionMode:'gm-manual',activityType:'utility'} as any)).toEqual([]);
    expect(()=>bindSourceOperations(source,[conditional(q,'2d6','cold')])).toThrow('negation-or-binding');
    const mixed=q.slice(0,-1)+', and the attacker takes 1d6 Fire damage.',actual='Guard. '+mixed;
    expect(sourceOperationErrors(actual,bindSourceOperations(actual,[conditional(mixed,'1d6','fire')]))).toEqual([]);
    expect(()=>bindSourceOperations(actual,[conditional(mixed,'2d6','cold')])).toThrow('negation-or-binding');
  });
  test('direct damage remains an output with or without a preceding trigger',()=>{
    const ordinary='The creature takes 2d6 Cold damage.',source='Contact. '+ordinary,primary:any={id:'cold',name:'Cold',type:'damage',relationship:'primary',damage:[{formula:'2d6',type:'cold',relationship:'base'}],proof:{damage:[ordinary]}};
    expect(sourceOperationErrors(source,bindSourceOperations(source,[primary]))).toEqual([]);
    const triggered='When the creature is hit, it takes 2d6 Cold damage.',actual='Contact. '+triggered;
    expect(sourceOperationErrors(actual,bindSourceOperations(actual,[conditional(triggered,'2d6','cold')]))).toEqual([]);
  });
  test('a complete two-column lever row proves a choice without authorizing sequential or invented alternatives',()=>{
    const first='2 Each extended arm makes the following melee attack: +6 to hit, reach 5 ft. Hit: 1 Slashing damage.',second='Each extended arm makes the following melee attack: +6 to hit, reach 5 ft. Hit: The target is Grappled.',prefix='Engine. A lever can move up or down. Each lever returns to neutral after use. Levers Lever Up Down 1 A shutter opens. The shutter closes. ',suffix=' 3 The hatch opens. The hatch closes.',source=prefix+first+' '+second+suffix,legacyOps:any[]=[{id:'hit',name:'Up',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:6,reach:5},damage:[{formula:'1',type:'slashing',relationship:'base'}],proof:{attack:first,damage:[first]}},{id:'grab',name:'Down',type:'attack',relationship:'alternative',attack:{type:'mwak',toHit:6,reach:5},proof:{attack:second}}];
    expect(()=>bindSourceOperations(source,legacyOps)).toThrow('attack/type-or-bonus');
    const ops=newNeutralAttackContractVariant(legacyOps,'melee');
    expect(sourceOperationErrors(source,bindSourceOperations(source,ops))).toEqual([]);
    const sequential=structuredClone(ops);sequential[1].relationship='follow-up';expect(()=>bindSourceOperations(source,sequential)).toThrow('table-choice');
    for(const changed of [source.replace('Lever Up Down','Lever Position Effect'),source.replace('up or down','up and down'),source.replace(second,second+' Both attacks are made.'),source.replace(second,'3 '+second)])expect(()=>bindSourceOperations(changed,ops)).toThrow('unproven-alternative');
    const wrong=structuredClone(ops);wrong[1].attack.toHit=8;expect(()=>bindSourceOperations(source,wrong)).toThrow('attack/type-or-bonus');
    expect(()=>bindSourceOperations(source,[ops[0],ops[1],{...structuredClone(ops[1]),id:'copy'}])).toThrow();
  });
});


describe('source-bound eligible first operations and unique simple dawn recovery',()=>{
  for(const id of ['r14m-srd52-black-pudding-corrosive-form','r14m-srd52-gelatinous-cube-ooze-cube','r14r-demon-armor','r14r-manual-of-golems','r14r-pipes-of-the-sewers','r14m-srd52-adult-bronze-dragon-thunderclap'])test('the complete failed parent keeps its original source-proven operations: '+id,()=>{
    const parent=(roundFiveRules.cases as any[]).find(c=>c.id===id),before=JSON.stringify(parent),f=parent.features.find((f:typeof roundFiveRules.cases[number]['features'][number])=>f.operations.length),bound=bindSourceOperations(f.text,f.operations);
    expect(sourceOperationErrors(f.text,bound)).toEqual([]);expect(JSON.stringify(parent)).toBe(before);
    for(const op of bound){expect(op.sourceText).toBe(f.text);expect(op.evidence!.quote).toBe(f.text);expectSourceOperationProof(parent.source,op);}
    if(id.includes('pipes')){expect(bound[0]!.relationship).toBe('follow-up');expect(bound[0]!.save!.dc).toBe(15);expect(sourceFeatureResources(f.name,f.text).uses).toBeUndefined();}
  });
  const gmDamage=(q:string,relationship='conditional'):any=>({id:'roll',name:'GM source-condition damage',type:'damage',relationship:'follow-up',damage:[{formula:'1d8',type:'acid',relationship}],proof:{damage:[q]}});
  for(const subject of ['A creature that hits the guardian with a melee attack roll','A creature whose armor has just been struck','Any target that cannot read the tome and attempts to read it'])test('recipient qualification stays on a manual conditional roll: '+subject,()=>{
    const q=subject+' takes 1d8 Acid damage.',source='Contact. '+q,bound=bindSourceOperations(source,[gmDamage(q)]);expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.condition).toBe(source);expect(bound[0]!.damage![0]!.condition).toBe(source);
    const wrong=gmDamage(q);wrong.relationship='primary';wrong.damage[0].relationship='base';expect(()=>bindSourceOperations(source,[wrong])).toThrow('damage/0/condition');
  });
  test('successful check costs are GM damage rather than an invented Save',()=>{
    for(const q of ['As an action, a creature can pull an object free by succeeding on a DC 12 Strength (Athletics) check, and the puller takes 1d8 Acid damage.','On a successful Strength (Athletics) check, the opener takes 1d8 Acid damage.']){
      const source='Rescue. '+q,bound=bindSourceOperations(source,[gmDamage(q)]);expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.save).toBeUndefined();expect(bound[0]!.condition).toBe(source);
      const fake:any={id:'save',name:'Wrong check as Save',type:'save',relationship:'primary',save:{dc:12,abilities:['str'],choice:'single',outcome:'none'},proof:{save:q}};expect(()=>bindSourceOperations(source,[fake])).toThrow('save/dc-or-ability');
    }
  });
  test('a literal instead-of roll remains a separate replacement with one copy of its damage',()=>{
    const q='The gloves allow your Unarmed Strikes to deal 1d8 Acid damage instead of their usual damage.',source='Gloves. '+q,op=gmDamage(q,'replacement'),bound=bindSourceOperations(source,[op]);expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.damage).toHaveLength(1);expect(bound[0]!.damage![0]!.relationship).toBe('replacement');expect(bound[0]!.condition).toBe(source);
    const wrong=gmDamage(q,'base');wrong.relationship='primary';expect(()=>bindSourceOperations(source,[wrong])).toThrow('damage/0/condition');expect(()=>bindSourceOperations(source,[op,{...structuredClone(op),id:'copy'}])).toThrow('duplicate-part');
  });
  test('unqualified rolls and incoming mitigation cannot borrow unrelated eligibility',()=>{
    for(const q of ['The creature takes 1d8 Acid damage.','The creature reads about a successful check, and takes 1d8 Acid damage.','When the creature is hit, reduce the damage it takes by 1d8 Acid damage.'])expect(()=>bindSourceOperations('Guard. '+q,[gmDamage(q)])).toThrow();
    const q='The creature takes 1d8 Acid damage.',source='Guard. A creature that watches the door waits. '+q;expect(()=>bindSourceOperations(source,[gmDamage(q)])).toThrow('relationship');
    const q2='For each object it touches, the creature takes 1d8 Acid damage.',bound=bindSourceOperations('Contact. '+q2,[gmDamage(q2)]);expect(sourceOperationErrors('Contact. '+q2,bound)).toEqual([]);
  });
  test('a first follow-up Save needs its own printed trigger and never becomes a consuming primary',()=>{
    const q='Whenever a creature arrives within 30 feet while you are playing, it makes a DC 15 Wisdom saving throw.',source='Music. '+q,op:any={id:'arrival',name:'Arrival save',type:'save',relationship:'follow-up',save:{dc:15,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:q}},bound=bindSourceOperations(source,[op]);expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.relationship).toBe('follow-up');expect(bound[0]!.condition).toBe(source);
    const plain='The creature makes a DC 15 Wisdom saving throw.',wrong=structuredClone(op);wrong.proof.save=plain;expect(()=>bindSourceOperations('Music. Whenever the bell rings, a door opens. '+plain,[wrong])).toThrow('relationship');
    const wrongDC=structuredClone(op);wrongDC.save.dc=16;expect(()=>bindSourceOperations(source,[wrongDC])).toThrow('save/dc-or-ability');
  });
  test('an explicit Sphere radius is distinct from point range and cannot borrow a diameter',()=>{
    for(const [radius,range]of [[20,90],[15,75]]){
      const q=`Constitution Saving Throw: DC 17, each creature in a ${radius}-foot-radius Sphere centered on a point within ${range} feet.`,source='Sphere. '+q,op:any={id:'sphere',name:'Sphere',type:'save',relationship:'primary',save:{dc:17,abilities:['con'],choice:'single',outcome:'none'},range,aoe:{shape:'sphere',radius},proof:{save:q,range:q,aoe:q}};expect(sourceOperationErrors(source,bindSourceOperations(source,[op]))).toEqual([]);
      const swapped=structuredClone(op);swapped.aoe.radius=range;expect(()=>bindSourceOperations(source,[swapped])).toThrow('/aoe');const badRange=structuredClone(op);badRange.range=radius;expect(()=>bindSourceOperations(source,[badRange])).toThrow('/range');
      const diameter=q.replace('-foot-radius','-foot-diameter'),wrong=structuredClone(op);wrong.proof={save:diameter,range:diameter,aoe:diameter};expect(()=>bindSourceOperations('Sphere. '+diameter,[wrong])).toThrow('/aoe');
    }
  });
  test('one complete independent simple property proves one use until next dawn',()=>{
    const cooldown='Once used, this property can’t be used again until the next dawn.';
    for(const source of ['Beacon. You can take a Magic action to illuminate a target. '+cooldown,'Beacon\nWondrous Item, Rare You can take a Magic action to illuminate a target. '+cooldown,"Beacon. As an action, you illuminate a target. Once you use this property, you can't use it again until the next dawn."]){expect(sourceFeatureResources('Beacon',source).uses).toEqual({max:1,period:'dawn'});expect(sourceFeatureResources('Another Feature',source).uses).toBeUndefined();}
    const parent=(roundFiveRules.cases as any[]).find(c=>c.id==='r14r-rod-of-rulership'),f=parent.features[0];expect(sourceFeatureResources(f.name,f.text).uses).toEqual({max:1,period:'dawn'});
  });
  test('child properties, multiple activations and charge recovery cannot flatten into a dawn counter',()=>{
    const cooldown='Once used, this property cannot be used again until the next dawn.';
    for(const source of ['Beacon. First Property. You can take a Magic action to shine. '+cooldown,'Beacon. You can take a Magic action to shine. '+cooldown+' You can take an action to sing. '+cooldown,'Beacon. You can take a Magic action to shine. You can take an action to sing. '+cooldown,'Beacon. You can take a Magic action to shine. It has 3 charges and regains 1d3 charges at dawn. '+cooldown,'Beacon. You can take a Magic action to shine. '+cooldown.replace('.',' unless you expend a spell slot.'),'Beacon. You can take a Magic action to grant a target an ability. The target can use this property. '+cooldown])expect(sourceFeatureResources('Beacon',source).uses).toBeUndefined();
    for(const id of ['r14r-rod-of-lordly-might','r14r-pipes-of-the-sewers']){const parent=(roundFiveRules.cases as any[]).find(c=>c.id===id),f=parent.features[0];expect(sourceFeatureResources(f.name,f.text).uses).toBeUndefined();}
  });
});


describe('recipient eligibility versus event triggers',()=>{
  const operation=(q:string,type:'save'|'damage',relationship:'primary'|'follow-up'):any=>({id:'target',name:'Target',type,relationship,...(type==='save'?{save:{dc:14,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:q}}:{damage:[{formula:'1d8',type:'acid',relationship:relationship==='primary'?'base':'conditional'}],proof:{damage:[q]}})});
  const staticSubjects=[
    'Each creature that you can see within 30 feet',
    'A creature whose armor is damaged',
    'Each target that is immune to Fire damage',
    'A creature that can make melee attack rolls',
    'A creature whose owner can make melee attack rolls',
    'A creature that cannot hit the guardian',
    'A creature whose attacker is visible',
    'A creature whose owner has 10 Hit Points',
  ];
  for(const subject of staticSubjects)for(const type of ['save','damage'] as const)test('static recipient eligibility allows primary and rejects first follow-up: '+type+' / '+subject,()=>{
    const q=subject+(type==='save'?' must make a DC 14 Wisdom saving throw.':' takes 1d8 Acid damage.'),source='Gaze. '+q,primary=bindSourceOperations(source,[operation(q,type,'primary')]);
    expect(sourceOperationErrors(source,primary)).toEqual([]);expect(primary[0]!.condition).toBeUndefined();
    expect(()=>bindSourceOperations(source,[operation(q,type,'follow-up')])).toThrow('relationship');
  });
  test('static enumeration and use eligibility do not prove an independent first Save',()=>{
    for(const prefix of ['For each creature you can see within 30 feet,','While you are attuned to the rod,','If you can use this rod,']){
      const q=prefix+' one creature must make a DC 14 Wisdom saving throw.',source='Gaze. '+q,primary=bindSourceOperations(source,[operation(q,'save','primary')]);
      expect(sourceOperationErrors(source,primary)).toEqual([]);expect(()=>bindSourceOperations(source,[operation(q,'save','follow-up')])).toThrow('relationship');
    }
    const q='For each creature you can see within 30 feet, that creature takes 1d8 Acid damage.',source='Gaze. '+q;
    expect(sourceOperationErrors(source,bindSourceOperations(source,[operation(q,'damage','primary')]))).toEqual([]);expect(()=>bindSourceOperations(source,[operation(q,'damage','follow-up')])).toThrow('relationship');
  });
  test('actual spending and timing still prove first GM operations',()=>{
    for(const prefix of ['For each charge you expend,','After you expend a charge,','When a creature touches the stone,','At the end of a creature’s turn,'])for(const type of ['save','damage'] as const){
      const q=prefix+(type==='save'?' one creature must make a DC 14 Wisdom saving throw.':' the creature takes 1d8 Acid damage.'),source='Pulse. '+q,bound=bindSourceOperations(source,[operation(q,type,'follow-up')]);
      expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.condition).toBe(source);
    }
  });
  test('existing static damage result conditions keep their separate GM roll',()=>{
    for(const condition of ['if the target is a plant','if the target is prone','while you are attuned to the rod']){
      const q='The target takes 1d8 Acid damage '+condition+'.',source='Contact. '+q,bound=bindSourceOperations(source,[operation(q,'damage','follow-up')]);
      expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.condition).toBe(source);expect(bound[0]!.damage![0]!.condition).toBe(source);expect(()=>bindSourceOperations(source,[operation(q,'damage','primary')])).toThrow('damage/0/condition');
    }
  });
  for(const subject of [
    'A creature that hits the guardian with a melee attack roll',
    'Any target that cannot read the tome and attempts to read it',
    'A creature that you hit with a melee attack roll',
    'A creature whose wielder hits the guardian with a melee attack roll',
    'A creature whose armor has just been struck',
  ])for(const type of ['save','damage'] as const)test('an event-bearing relative predicate preserves the GM trigger: '+type+' / '+subject,()=>{
    const q=subject+(type==='save'?' must make a DC 14 Wisdom saving throw.':' takes 1d8 Acid damage.'),source='Contact. '+q,bound=bindSourceOperations(source,[operation(q,type,'follow-up')]);
    expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.condition).toBe(source);if(type==='damage')expect(bound[0]!.damage![0]!.condition).toBe(source);
  });
});


describe('round six source model gaps',()=>{
  for(const id of ['r15m-srd52-solar-flying-sword','r15r-ammunition-of-slaying','r15r-dagger-of-venom','r15r-feather-token','r15r-horn-of-blasting','r15r-mirror-of-life-trapping','r15r-alchemists-fire','r15r-hunting-trap','r15r-oil'])test('complete failed model parent: '+id,()=>{
    const parent=(roundSixRules.cases as any[]).find(c=>c.id===id),before=JSON.stringify(parent);
    for(const f of parent.features){if(!f.operations.length)continue;const bound=bindSourceOperations(f.text,f.operations);expect(sourceOperationErrors(f.text,bound)).toEqual([]);for(const op of bound){expect(op.sourceText).toBe(f.text);expect(op.evidence!.quote).toBe(f.text);expectSourceOperationProof(parent.source,op);}}
    expect(JSON.stringify(parent)).toBe(before);
  });
  test('a complete independent object or Initiative cooldown belongs to that feature',()=>{
    for(const [id,name,period]of [['r15r-bowl-of-commanding-water-elementals','Bowl of Commanding Water Elementals','dawn'],['r15r-perfect-focus','Level 2: Uncanny Metabolism','longRest']] as const){
      const parent=(roundSixRules.cases as any[]).find(c=>c.id===id),f=parent.features.find((f:typeof roundSixRules.cases[number]['features'][number])=>f.name===name);expect(sourceFeatureResources(f.name,f.text,parent.creature.identity.name).uses).toEqual({max:1,period});expect(sourceFeatureResources('Sentinel',f.text,parent.creature.identity.name).uses).toBeUndefined();
    }
  });
});


describe('round six narrow proof guards',()=>{
  const parent=(id:string)=>(roundSixRules.cases as any[]).find(c=>c.id===id).features[0];
  const rewritten=(source:string,ops:any[],from:string,to:string)=>{
    const visit=(value:any):any=>typeof value==='string'?value.replaceAll(from,to):Array.isArray(value)?value.map(visit):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,visit(entry)])):value;
    return{source:source.replaceAll(from,to),ops:visit(ops)};
  };
  test('same-sentence ranged choices cannot become sequential, duplicated, incomplete or mismatched rolls',()=>{
    const f=parent('r15m-srd52-solar-flying-sword');
    for(const mutate of [(ops:any[])=>ops[1].relationship='follow-up',(ops:any[])=>ops[1].attack.type='mwak',(ops:any[])=>ops[1].attack.range=10,(ops:any[])=>ops[1].damage[0].formula='8d8',(ops:any[])=>ops.push({...structuredClone(ops[1]),id:'copy'}),(ops:any[])=>ops[1].damage.push({...ops[1].damage[0]})]){const ops=structuredClone(f.operations);mutate(ops);expect(()=>bindSourceOperations(f.text,ops)).toThrow();}
    expect(()=>bindSourceOperations(f.text,[f.operations[0]])).toThrow('attack-choice-omitted');
    const and=rewritten(f.text,f.operations,'Melee or Ranged','Melee and Ranged');expect(()=>bindSourceOperations(and.source,and.ops)).toThrow('unproven-alternative');
  });
  test('same-sentence conditional damage modes keep exactly one correct damage atom per attack choice',()=>{
    const frozen=parent('r15m-srd52-giant-seahorse-ram');
    expect(()=>bindSourceOperations(frozen.text,frozen.operations)).toThrow('attack/type-or-bonus');
    const f={...frozen,operations:newNeutralAttackContractVariant(frozen.operations,'melee')};
    expect(sourceOperationErrors(f.text,bindSourceOperations(f.text,f.operations))).toEqual([]);
    for(const mutate of [(ops:any[])=>ops[1].relationship='follow-up',(ops:any[])=>ops[1].damage[0].relationship='base',(ops:any[])=>ops[0].damage[0].relationship='replacement',(ops:any[])=>ops[1].attack.toHit=20,(ops:any[])=>ops[0].damage.push({...ops[1].damage[0]}),(ops:any[])=>ops.push({...structuredClone(ops[1]),id:'copy'})]){const ops=structuredClone(f.operations);mutate(ops);expect(()=>bindSourceOperations(f.text,ops)).toThrow();}
    const and=rewritten(f.text,f.operations,', or 11',', and 11');expect(()=>bindSourceOperations(and.source,and.ops)).toThrow('unproven-alternative');
    const other=rewritten(f.text,f.operations,'seahorse','runner');other.source=other.source.replaceAll('+4','+6').replaceAll('5 ft.','10 ft.');other.ops=other.ops.map((op:any)=>({...op,sourceText:other.source,condition:other.source,attack:{...op.attack,toHit:6,reach:10},proof:{attack:other.source.slice(5),damage:[other.source.slice(5)]}}));expect(sourceOperationErrors(other.source,bindSourceOperations(other.source,other.ops))).toEqual([]);
  });
  test('actual damage, stepping and perception events differ from static or modal target eligibility',()=>{
    for(const [prefix,event]of [['If a creature takes damage from the arrow,',true],['A creature that steps on the plate',true],['Any creature that sees its reflection in the mirror',true],['If a creature can take damage from the arrow,',false],['A creature that can step on the plate',false],['Any creature that you can see in the mirror',false]] as const){
      const q=prefix+' must make a DC 14 Wisdom saving throw.',source='Trigger. '+q,op:any={id:'trigger',name:'Trigger',type:'save',relationship:'follow-up',save:{dc:14,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:q}};
      if(event){const bound=bindSourceOperations(source,[op]);expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound[0]!.condition).toBe(source);}else expect(()=>bindSourceOperations(source,[op])).toThrow('relationship');
    }
  });
  test('a demonstrative Save binds only its adjacent positive same-target hit antecedent',()=>{
    const q='That creature must make a DC 14 Wisdom saving throw.',op:any={id:'hit',name:'After hit',type:'save',relationship:'follow-up',save:{dc:14,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:q}};
    const before='The coating remains until an attack using this weapon hits a creature.',source='Coating. '+before+' '+q;expect(sourceOperationErrors(source,bindSourceOperations(source,[op]))).toEqual([]);
    for(const previous of [before.replace('hits','cannot hit'),'You can see a creature.',before+' Other Property.','The coating has an image of a creature.'])expect(()=>bindSourceOperations('Coating. '+previous+' '+q,[op])).toThrow('relationship');
  });
  test('a created-entity THEN attack retains its real bonus and origin without granting an unqualified attack',()=>{
    const f=parent('r15r-feather-token');
    for(const [from,to]of [['a floating whip takes its place','a floating whip is painted on it'],['a floating whip takes its place','a floating bird takes its place'],['You can then take a Bonus Action','You can take a Bonus Action']] as const){const changed=rewritten(f.text,f.operations,from,to);expect(()=>auditBoundSourceOperations(changed.source,changed.ops)).toThrow('relationship');}
    for(const [field,value]of [['toHit',10],['reach',20]] as const){const ops=structuredClone(f.operations);ops[0].attack[field]=value;expect(()=>auditBoundSourceOperations(f.text,ops)).toThrow('attack/');}
    const conditioned=rewritten(f.text,f.operations,'On a hit, the target takes 1d6 + 5 Force damage.','On a hit, the target takes 1d6 + 5 Force damage if the target is prone.');expect(()=>auditBoundSourceOperations(conditioned.source,conditioned.ops)).toThrow('damage/0/condition');
    const omitted=sourceFeatureBasicOmissions(f.text,{name:f.name,description:f.text,executionMode:'gm-manual',activityType:'utility'} as any);expect(omitted).toContain('attack');
  });
  test('variable Save failure and failed check costs retain their result without inventing DCs',()=>{
    const q='The target must succeed on a Dexterity saving throw (DC 8 plus your Dexterity modifier and Proficiency Bonus) or take 1d4 Fire damage.',source='Flask. '+q,op:any={id:'failure',name:'Manual failure',type:'damage',relationship:'follow-up',damage:[{formula:'1d4',type:'fire',relationship:'conditional'}],proof:{damage:[q]}};
    expect(sourceOperationErrors(source,bindSourceOperations(source,[op]))).toEqual([]);
    const wrong=structuredClone(op);wrong.relationship='primary';wrong.damage[0].relationship='base';expect(()=>bindSourceOperations(source,[wrong])).toThrow('result-branch-condition');
    const fake:any={id:'save',name:'Guessed DC',type:'save',relationship:'primary',save:{dc:8,abilities:['dex'],choice:'single',outcome:'none'},damage:[{formula:'1d4',type:'fire',relationship:'base'}],proof:{save:q,damage:[q]}};expect(()=>bindSourceOperations(source,[fake])).toThrow('save/dc-or-ability');
    const cost='Each failed check deals 1 Piercing damage to the trapped creature.',actual='Trap. '+cost,damage:any={id:'cost',name:'Check cost',type:'damage',relationship:'follow-up',damage:[{formula:'1',type:'piercing',relationship:'conditional'}],proof:{damage:[cost]}};expect(sourceOperationErrors(actual,bindSourceOperations(actual,[damage]))).toEqual([]);
  });
  test('an independent object, explosion or check result cannot be borrowed by an earlier Save',()=>{
    const f=parent('r15r-horn-of-blasting');
    for(const part of [1,2]){const ops=structuredClone(f.operations);ops[0].damage.push(ops[part].damage[0]);ops[0].proof.damage.push(ops[part].proof.damage[0]);ops.splice(part,1);expect(()=>bindSourceOperations(f.text,ops)).toThrow('operation-owner');}
    for(const outcome of ['none','full']){const ops=structuredClone(f.operations);ops[0].save.outcome=outcome;expect(()=>bindSourceOperations(f.text,ops)).toThrow('save/outcome');}
    const trap=parent('r15r-hunting-trap'),ops=structuredClone(trap.operations);ops[0].damage.push(ops[1].damage[0]);ops[0].proof.damage.push(ops[1].proof.damage[0]);ops.pop();expect(()=>bindSourceOperations(trap.text,ops)).toThrow('operation-owner');
  });
  test('a square area proves its side length separately from placement and square footage',()=>{
    const q='You pour liquid to cover a 7-foot-square area within 20 feet of yourself.',hit='If lit, the liquid deals 5 Fire damage to a creature that enters the area.',source='Liquid. '+q+' '+hit,op:any={id:'area',name:'Lit area',type:'damage',relationship:'follow-up',damage:[{formula:'5',type:'fire',relationship:'conditional'}],range:20,aoe:{shape:'rectangle',radius:7},proof:{range:q,aoe:q,damage:[hit]}};
    expect(sourceOperationErrors(source,bindSourceOperations(source,[op]))).toEqual([]);
    for(const radius of [20,49]){const wrong=structuredClone(op);wrong.aoe.radius=radius;expect(()=>bindSourceOperations(source,[wrong])).toThrow('/aoe');}
    const footage=rewritten(source,[op],'7-foot-square area','49-square-foot area');expect(()=>bindSourceOperations(footage.source,footage.ops)).toThrow('/aoe');
  });
  test('object and long-rest cooldowns cannot borrow another owner, hide an ability or merge resource pools',()=>{
    const cooldown='The vessel can’t be used this way again until the next dawn.',source='Vessel. You can take a Magic action to summon a helper. '+cooldown+' The vessel is about 1 foot in diameter and half as deep. It holds about 3 gallons.';
    expect(sourceFeatureResources('Vessel',source,'Sentinel').uses).toEqual({max:1,period:'dawn'});
    for(const changed of [source.replace('The vessel can’t','The target can’t'),source.replace('The vessel can’t','Sentinel can’t'),source.replace('3 gallons.','3 gallons and can deal 1d6 Fire damage.'),source+' You can take a Magic action to summon another helper.',source.replace(cooldown,'It has 3 charges. '+cooldown),source.replace(cooldown,'Other Property. '+cooldown)])expect(sourceFeatureResources('Vessel',changed,'Sentinel').uses).toBeUndefined();
    const rest='Renewal. When you roll Initiative, you can regain your expended points. Once you use this feature, you can’t use it again until you finish a Long Rest.';expect(sourceFeatureResources('Renewal',rest).uses).toEqual({max:1,period:'longRest'});expect(sourceFeatureResources('Another Feature',rest).uses).toBeUndefined();expect(sourceFeatureResources('Renewal',rest.replace('Long Rest','Short Rest')).uses).toBeUndefined();
  });
});


describe('legacy combined attack compatibility',()=>{
  const legacy=(bonus=3,reach=5,range=20,longRange=60)=>{
    const q=`Melee or Ranged Weapon Attack: +${bonus} to hit, reach ${reach} ft. or range ${range}/${longRange} ft., one target.`,hit='Hit: 1d6 + 1 Piercing damage.',source='Strike. '+q+' '+hit,op:any={id:'combined',name:'Combined legacy attack',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:bonus,reach,range,longRange},damage:[{formula:'1d6+1',type:'piercing',relationship:'base'}],proof:{attack:q,damage:[hit]}};
    return{source,op};
  };
  test('one legacy Weapon Attack preserves its complete near and remote facts',()=>{
    for(const [bonus,reach,range,longRange]of [[3,5,20,60],[6,0,30,90]]){const {source,op}=legacy(bonus,reach,range,longRange),bound=bindSourceOperations(source,[op]);expect(sourceOperationErrors(source,bound)).toEqual([]);expect(bound).toHaveLength(1);expect(bound[0]!.attack).toEqual(op.attack);}
  });
  test('legacy compatibility cannot conceal missing, invented or simultaneous attack modes',()=>{
    const {source,op}=legacy();
    const proposed=structuredClone(op);proposed.attack.reach=99;
    const before=structuredClone(proposed),candidate=bindSourceOperations(source,[proposed]);
    expect(candidate[0]!.attack).toEqual(proposed.attack);expect(proposed).toEqual(before);
    for(const field of ['reach','range','longRange']){const wrong=structuredClone(op);delete wrong.attack[field];expect(()=>auditBoundSourceOperations(source,[wrong])).toThrow();}
    for(const [field,value]of [['type','rwak'],['toHit',4],['reach',20],['range',5],['longRange',20]] as const){const wrong=structuredClone(op);wrong.attack[field]=value;expect(()=>auditBoundSourceOperations(source,[wrong])).toThrow();}
    const changed=source.replace('Melee or Ranged','Melee and Ranged'),wrong=structuredClone(op);wrong.proof.attack=wrong.proof.attack.replace('Melee or Ranged','Melee and Ranged');expect(()=>auditBoundSourceOperations(changed,[wrong])).toThrow();
    expect(()=>auditBoundSourceOperations(source,[op,{...structuredClone(op),id:'duplicate'}])).toThrow('duplicate-operation');
  });
  test('modern separate modes still need both attacks and cannot merge or stack their damage',()=>{
    const solar=(roundSixRules.cases as any[]).find(c=>c.id==='r15m-srd52-solar-flying-sword').features[0],seahorse=(roundSixRules.cases as any[]).find(c=>c.id==='r15m-srd52-giant-seahorse-ram').features[0];
    expect(()=>bindSourceOperations(seahorse.text,seahorse.operations)).toThrow('attack/type-or-bonus');
    // Solar's explicitly combined modes retain their archived contract. Only
    // the separately named Seahorse input is a new neutral-contract variant.
    for(const f of [solar,{...seahorse,operations:newNeutralAttackContractVariant(seahorse.operations,'melee')}]){expect(sourceOperationErrors(f.text,bindSourceOperations(f.text,f.operations))).toEqual([]);expect(()=>bindSourceOperations(f.text,[f.operations[0]])).toThrow();const wrong=structuredClone(f.operations);wrong[1].relationship='follow-up';expect(()=>bindSourceOperations(f.text,wrong)).toThrow();}
    const f=(roundSixRules.cases as any[]).find(c=>c.id==='r15m-srd52-solar-flying-sword').features[0],merged=structuredClone(f.operations[0]);merged.attack.range=f.operations[1].attack.range;expect(()=>bindSourceOperations(f.text,[merged])).toThrow('attack/type-or-bonus');
  });
});


describe('round seven source model gaps',()=>{
  for(const id of ['r16m-srd52-air-elemental-whirlwind','r16m-srd52-adult-silver-dragon-cold-gale','r16r-thunderous-greatclub','r16r-ball-bearings'])test('complete newly failed source model parent: '+id,()=>{
    const parent=(roundSevenRules.cases as any[]).find(c=>c.id===id),before=JSON.stringify(parent);
    for(const f of parent.features){if(!f.operations.length)continue;const bound=bindSourceOperations(f.text,f.operations);expect(sourceOperationErrors(f.text,bound)).toEqual([]);for(const op of bound){expect(op.sourceText).toBe(f.text);expect(op.evidence!.quote).toBe(f.text);expectSourceOperationProof(parent.source,op);}if(id.includes('cold-gale'))expect(bound[0]!.aoe).toEqual({shape:'line',radius:60,width:10});}
    expect(JSON.stringify(parent)).toBe(before);
  });
  test('fixed long-rest use keeps its own maximum despite a separate optional restore payment',()=>{
    const parent=(roundSevenRules.cases as any[]).find(c=>c.id==='r16r-intimidating-presence'),f=parent.features[0];expect(sourceFeatureResources(f.name,f.text).uses).toEqual({max:1,period:'longRest'});expect(sourceFeatureResources(parent.features[1].name,parent.features[1].text).uses).toBeUndefined();
  });
});


describe('round seven narrow semantics and native geometry',()=>{
  const saveOp=(q:string,damage?:string):any=>({id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:16,abilities:['con'],choice:'single',outcome:damage?'half':'none'},...(damage?{damage:[{formula:'2d6',type:'cold',relationship:'base'}]}:{}),proof:{save:q,...(damage?{damage:[damage]}:{})}});
  test('roll-only Advantage conditions do not qualify unrelated Hit damage or hide a damage modifier',()=>{
    for(const qualifier of ['with Advantage if the target is Grappled','with Disadvantage if the target is not Restrained','with Advantage when the target is Prone']){
      const q='Melee Attack Roll: +7 ('+qualifier+'), reach 5 ft. Hit: 1d6 Fire damage.',source='Attack. '+q,legacyOp:any={id:'hit',name:'Hit',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:7,reach:5},damage:[{formula:'1d6',type:'fire',relationship:'base'}],proof:{attack:q,damage:[q]}};
      expect(()=>bindSourceOperations(source,[legacyOp])).toThrow('attack/type-or-bonus');
      const [op]=newNeutralAttackContractVariant([legacyOp],'melee');expect(sourceOperationErrors(source,bindSourceOperations(source,[op]))).toEqual([]);
      const changed=q.replace('Fire damage.','Fire damage if the target is a plant.'),wrong=structuredClone(op);wrong.proof={attack:changed,damage:[changed]};expect(()=>bindSourceOperations('Attack. '+changed,[wrong])).toThrow('damage/0/condition');
    }
    const q='Melee Attack Roll: +7 (with Advantage if the target is Prone, and deals 2d6 Cold damage), reach 5 ft. Hit: 1d6 Fire damage.',legacyOp:any={id:'hit',name:'Hit',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:7,reach:5},damage:[{formula:'1d6',type:'fire',relationship:'base'}],proof:{attack:q,damage:[q]}};
    expect(()=>bindSourceOperations('Attack. '+q,[legacyOp])).toThrow('attack/type-or-bonus');
    const [op]=newNeutralAttackContractVariant([legacyOp],'melee');expect(()=>bindSourceOperations('Attack. '+q,[op])).toThrow();
  });
  test('an actual object-relative hit remains conditional while hit capacity remains static',()=>{
    for(const target of ['any creature it hits','objects it hits']){const q='The weapon deals 1d8 Thunder damage to '+target+'.',source='Weapon. '+q,op:any={id:'rider',name:'Hit rider',type:'damage',relationship:'follow-up',damage:[{formula:'1d8',type:'thunder',relationship:'conditional'}],proof:{damage:[q]}};expect(sourceOperationErrors(source,bindSourceOperations(source,[op]))).toEqual([]);const plain=q.replace('it hits','it can hit'),wrong=structuredClone(op);wrong.proof.damage=[plain];expect(()=>bindSourceOperations('Weapon. '+plain,[wrong])).toThrow('relationship');}
  });
  test('untimed has and have states retain their exact failure owner and every extra lifetime stays GM',()=>{
    for(const text of ['Failure: The target has the Prone condition.','Failure: The creature takes 2d6 Cold damage and has the Prone condition.','Failure: 2d6 Cold damage, and the target is pushed up to 20 feet straight away and has the Prone condition.','or have the Prone condition.'])expect(sourceFailedSaveStatuses(text)).toEqual(['prone']);
    for(const text of ['Failure: The target has the Prone condition for 1 minute.','Failure: The target has the Prone condition until the end of its next turn.','Failure: The target has the Prone condition. This condition ends when it takes damage.','Failure: The target has the Prone condition. It takes 1 minute to recover from the condition.','Failure: The target does not have the Prone condition.','Failure: The target is moved, and its weapon has the Prone condition.','Failure: The target has the Prone condition if it is Large.'])expect(sourceFailedSaveStatuses(text)).toEqual([]);
    expect(sourceFailedSaveStatuses('Failure: have the Prone condition. It takes 10 minutes to recover the bearings.')).toEqual(['prone']);
  });
  test('a restore payment keeps one fixed long-rest use without accepting unknown bypasses or self resources',()=>{
    const body='Presence. As a Bonus Action, you can frighten a target. Once you use this feature, you can’t use it again until you finish a Long Rest',suffix=' unless you expend a use of your Resolve (no action required) to restore your use of it.';
    expect(sourceFeatureResources('Presence',body+suffix).uses).toEqual({max:1,period:'longRest'});
    for(const tail of [' unless you are angry.',' unless you expend a use of your Resolve to use it again.',' unless you expend a use of your Presence to restore your use of it.',' unless you expend a variable number of points to restore your use of it.'])expect(sourceFeatureResources('Presence',body+tail).uses).toBeUndefined();
  });
  for(const [length,width,geometry]of [[60,10,'60-foot-long, 10-foot-wide Line'],[45,12,'12-foot-wide, 45-foot-long Line'],[72,8,'Line that is 72 feet long and 8 feet wide']] as const)test('complete IR to Markdown to Actor preserves native Line width: '+geometry,async()=>{
    const q='Constitution Saving Throw: DC 16, each creature in a '+geometry+'.',damage='Failure: 2d6 Cold damage.',source='Shaped Burst. '+q+' '+damage+' Success: Half damage.',op=saveOp(q,damage);op.aoe={shape:'line',radius:length};op.proof.aoe=q;
    const before=JSON.stringify(op),bound=bindSourceOperations(source,[op]);expect(bound[0]!.aoe).toEqual({shape:'line',radius:length,width});expect(JSON.stringify(op)).toBe(before);
    for(const value of [5,length,width+1]){if(value===width)continue;const wrong=structuredClone(op);wrong.aoe.width=value;expect(()=>bindSourceOperations(source,[wrong])).toThrow('aoe/width');}
    const {actor,ir,markdown,source:full}=await formal('choice',header+'Actions\n'+source+'\n',source,()=>[op]),item=actor.items[0],activity=Object.values(item.system.activities)[0] as any;expect(ir.creature.actions[0]!.sourceOperations![0]!.aoe!.width).toBe(width);expect(new YamlParser().parse(markdown)).toBeDefined();expect(activity.target.template).toEqual({type:'line',size:String(length),width:String(width),units:'ft'});
    for(const value of [undefined,5,length]){const changed=structuredClone(actor),target=(Object.values(changed.items[0].system.activities)[0] as any).target.template;if(value===undefined)delete target.width;else target.width=String(value);expect(verifyMonsterIntake(full,ir,markdown,changed).findings).toContainEqual(expect.objectContaining({code:'ACTOR_SOURCE_OPERATION_AREA_DRIFT'}));}
  });
  for(const [radius,height,geometry]of [[10,40,'10-foot-radius, 40-foot-high Cylinder'],[12,55,'55-foot-high, 12-foot-radius Cylinder'],[15,60,'Cylinder with a radius of 15 feet and a height of 60 feet']] as const)test('complete IR to Markdown to Actor preserves native Cylinder height: '+geometry,async()=>{
    const q='Constitution Saving Throw: DC 16, each creature in a '+geometry+' originating from a point within 90 feet.',damage='Failure: 2d6 Cold damage.',source='Column Burst. '+q+' '+damage+' Success: Half damage.',op=saveOp(q,damage);op.aoe={shape:'cylinder',radius};op.range=90;op.proof={...op.proof,aoe:q,range:q};
    const bound=bindSourceOperations(source,[op]);expect(bound[0]!.aoe).toEqual({shape:'cylinder',radius,height});
    for(const value of [radius,90,height+1]){const wrong=structuredClone(op);wrong.aoe.height=value;expect(()=>bindSourceOperations(source,[wrong])).toThrow('aoe/height');}
    const {actor,ir,markdown,source:full}=await formal('choice',header+'Actions\n'+source+'\n',source,()=>[op]),activity=Object.values(actor.items[0].system.activities)[0] as any;expect(activity.target.template).toEqual({type:'cylinder',size:String(radius),height:String(height),units:'ft'});expect(activity.range.value).toBe(90);
    const changed=structuredClone(actor);(Object.values(changed.items[0].system.activities)[0] as any).target.template.height='5';expect(verifyMonsterIntake(full,ir,markdown,changed).findings).toContainEqual(expect.objectContaining({code:'ACTOR_SOURCE_OPERATION_AREA_DRIFT'}));
  });
  test('the rectangle compatibility alias projects only a source-proven square and preserves unrelated Cone output',async()=>{
    for(const geometry of ['7-foot-square area','7尺见方的区域']){const q='Constitution Saving Throw: DC 16, each creature in a '+geometry+'.',source='Square Burst. '+q,op=saveOp(q);op.aoe={shape:'rectangle',radius:7};op.proof.aoe=q;const {actor,ir,markdown,source:full}=await formal('choice',header+'Actions\n'+source+'\n',source,()=>[op]);expect((Object.values(actor.items[0].system.activities)[0] as any).target.template).toEqual({type:'square',size:'7',units:'ft'});const changed=structuredClone(actor);(Object.values(changed.items[0].system.activities)[0] as any).target.template.type='rectangle';expect(verifyMonsterIntake(full,ir,markdown,changed).findings).toContainEqual(expect.objectContaining({code:'ACTOR_SOURCE_OPERATION_AREA_DRIFT'}));}
    const q='Constitution Saving Throw: DC 16, each creature in a 10-foot-by-20-foot rectangle.',op=saveOp(q);op.aoe={shape:'rectangle',radius:10};op.proof.aoe=q;expect(()=>bindSourceOperations('Rectangle. '+q,[op])).toThrow('/aoe');
    const {actor}=await formal('choice');expect((Object.values(actor.items[0].system.activities)[0] as any).target.template).toEqual({type:'cone',size:'30',units:'ft'});
  });
  test('line width and cylinder height cannot borrow an unrelated shape, placement or entity dimension',()=>{
    for(const [shape,radius,dimension,value,geometry]of [['line',60,'width',10,'60-foot Line near a pillar that is 10 feet wide'],['cylinder',10,'height',40,'10-foot-radius Cylinder near a tower that is 40 feet high'],['cone',30,'width',10,'30-foot Cone'],['sphere',20,'height',40,'20-foot-radius Sphere']] as const){const q='Constitution Saving Throw: DC 16, each creature in a '+geometry+'.',op=saveOp(q);op.aoe={shape,radius,[dimension]:value};op.proof.aoe=q;expect(()=>bindSourceOperations('Area. '+q,[op])).toThrow('aoe/');}
    const q='Constitution Saving Throw: DC 16, each creature in a 60-foot-long, 10-foot-wide Line or a 30-foot-long, 5-foot-wide Line.',op=saveOp(q);op.aoe={shape:'line',radius:60};op.proof.aoe=q;expect(()=>bindSourceOperations('Choice. '+q,[op])).toThrow('/aoe');
  });
});


describe('failed Save modern status subject ownership',()=>{
  test('another or nearby creature cannot receive the original failed target status',()=>{
    for(const text of ['Failure: Another creature has the Prone condition.','Failure: A nearby creature has the Prone condition.','Failure: The target summons another creature that has the Prone condition.','Failure: The target pushes another creature, and that creature has the Prone condition.','Failure: The target pushes another creature, and the creature has the Prone condition.','Failure: The target takes 2d6 Cold damage, and a nearby creature moves and has the Prone condition.'])expect(sourceFailedSaveStatuses(text)).toEqual([]);
  });
  test('the explicit failed target and its own damage or push keep their ordinary state',()=>{
    for(const text of ['Failure: The target has the Prone condition.','Failure: The target takes damage from another creature, and has the Prone condition.','Failure: The target takes 2d6 Cold damage and is pushed up to 20 feet and has the Prone condition.','Failure: The creature has the Prone condition.','Failure: The creature takes 2d6 Cold damage and has the Prone condition.','Failure: 2d6 Cold damage, and the target is pushed up to 20 feet straight away and has the Prone condition.','Failure: 2d6 Cold damage, and the target has the Prone condition.','or have the Prone condition.'])expect(sourceFailedSaveStatuses(text)).toEqual(['prone']);
  });
  test('a non-target modern state cannot become a native effect on the Save',()=>{
    const q='Constitution Saving Throw: DC 16, one creature.',failure='Failure: Another creature has the Prone condition.',source='Rule. '+q+' '+failure,op:any={id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:16,abilities:['con'],choice:'single',outcome:'none'},proof:{save:q}},bound=bindSourceOperations(source,[op]);expect(bound[0]!.failureStatuses).toBeUndefined();
    expect(()=>bindSourceOperations(source,[{...op,failureStatuses:['prone']}])).toThrow('failureStatuses');
  });
});


describe('source operation target recipient ownership',()=>{
  const greatclub=()=>(roundSevenRules.cases as any[]).find(c=>c.id==='r16r-thunderous-greatclub').features[0];
  test('structure damage cannot borrow the following creature Save target and the Save cannot borrow structures',()=>{
    const f=greatclub(),damage=f.operations.findIndex((op:any)=>op.id==='earthquake-ground-structures-only'),save=f.operations.findIndex((op:any)=>op.id==='earthquake-ground-creature-prone');
    const correct=bindSourceOperations(f.text,f.operations);expect(correct[damage]!.targetSpecial).toBe('Structures in contact with the ground in that area');expect(correct[save]!.targetSpecial).toBe('each creature on the ground in that area');
    for(const [index,target]of [[damage,'each creature on the ground in that area'],[save,'Structures in contact with the ground in that area']]){const wrong=structuredClone(f.operations);wrong[index].targetSpecial=target;expect(()=>bindSourceOperations(f.text,wrong)).toThrow('targetSpecial');}
  });
  test('the two hit riders retain distinct creature and unworn-object recipients',()=>{
    const f=greatclub(),correct=bindSourceOperations(f.text,f.operations);expect(correct[0]!.targetSpecial).toBe('any creature it hits');expect(correct[1]!.targetSpecial).toBe('objects it hits that aren’t being worn or carried');
    for(const index of [0,1]){const wrong=structuredClone(f.operations);wrong[index].targetSpecial=f.operations[1-index].targetSpecial;expect(()=>bindSourceOperations(f.text,wrong)).toThrow('targetSpecial');}
  });
});


describe('source operation target direction predicates',()=>{
  test('Save-before-Damage and semicolon siblings keep their own recipients in either direction',()=>{
    for(const connector of [', and ','; ']){const q='Each creature in the area must make a DC 20 Dexterity saving throw'+connector+'the objects on the ground take 5 Fire damage.',source='Rule. '+q,ops:any[]=[{id:'save',name:'Creature Save',type:'save',relationship:'primary',save:{dc:20,abilities:['dex'],choice:'single',outcome:'none'},targetSpecial:'Each creature in the area',proof:{save:q,target:q}},{id:'damage',name:'Object damage',type:'damage',relationship:'follow-up',damage:[{formula:'5',type:'fire',relationship:'conditional'}],targetSpecial:'the objects on the ground',proof:{damage:[q],target:q}}];expect(sourceOperationErrors(source,bindSourceOperations(source,ops))).toEqual([]);for(const index of [0,1]){const wrong=structuredClone(ops);wrong[index].targetSpecial=ops[1-index].targetSpecial;expect(()=>bindSourceOperations(source,wrong)).toThrow('targetSpecial');}}
  });
  test('an explicit damage object is the recipient rather than the source or another qualification entity',()=>{
    const q='The blast deals 5 Fire damage to the user holding the device.',source='Blast. '+q,op:any={id:'damage',name:'User damage',type:'damage',relationship:'primary',damage:[{formula:'5',type:'fire',relationship:'base'}],targetSpecial:'the user holding the device',proof:{damage:[q],target:q}};expect(sourceOperationErrors(source,bindSourceOperations(source,[op]))).toEqual([]);for(const target of ['The blast','the device'])expect(()=>bindSourceOperations(source,[{...op,targetSpecial:target}])).toThrow('targetSpecial');
  });
  test('one literal preceding Target directive may qualify only the adjacent operation on that target',()=>{
    const directive='Target one creature or object you can see within 20 feet of yourself.',q='The target must succeed on a Dexterity saving throw against your spell save DC or take 1d4 Fire damage.',source='Flask. '+directive+' '+q,op:any={id:'damage',name:'Failed save',type:'damage',relationship:'follow-up',damage:[{formula:'1d4',type:'fire',relationship:'conditional'}],targetSpecial:'one creature or object you can see within 20 feet of yourself',proof:{damage:[q],target:directive}};expect(sourceOperationErrors(source,bindSourceOperations(source,[op]))).toEqual([]);expect(()=>bindSourceOperations('Flask. '+directive+' Other Rule. '+q,[op])).toThrow('targetSpecial');
  });
});


describe('source operation explicit native recipient type',()=>{
  test('the three real Greatclub object recipients project native objects and reject creature corruption',async()=>{
    const f=(roundSevenRules.cases as any[]).find(c=>c.id==='r16r-thunderous-greatclub').features[0],{source,ir,markdown,actor}=await formal('choice',header+'Actions\n'+f.text+'\n',f.text,()=>f.operations),objects=['weapon-hit-unworn-object-extra-only','clap-cone-nonmagical-unworn-objects','earthquake-ground-structures-only'];
    for(const op of f.operations){const activity=Object.values(actor.items[0].system.activities).find((entry:any)=>entry.flags?.fvttJsonGenerator?.sourceOperation?.id===op.id) as any;expect(activity.target.affects.type).toBe(objects.includes(op.id)?'object':'creature');expect(activity.target.affects.special).toBe(op.targetSpecial);}
    for(const id of objects){const changed=structuredClone(actor),activity=Object.values(changed.items[0].system.activities).find((entry:any)=>entry.flags?.fvttJsonGenerator?.sourceOperation?.id===id) as any;activity.target.affects.type='creature';expect(verifyMonsterIntake(source,ir,markdown,changed).findings).toContainEqual(expect.objectContaining({code:'ACTOR_SOURCE_OPERATION_TARGET_DRIFT'}));}
  });
});


describe('source operation explicit recipient kind predicates',()=>{
  const damage=(recipient:string)=>{const q=recipient+' takes 5 Fire damage.',source='Recipient. '+q,op:any={id:'damage',name:'Literal damage',type:'damage',relationship:'primary',damage:[{formula:'5',type:'fire',relationship:'base'}],targetSpecial:recipient,proof:{damage:[q],target:q}};return{source,op};};
  test('known corpus receiver heads preserve mixed sets and exclude qualification nouns',()=>{
    for(const [recipient,expected]of [['Structures in contact with the ground in that area','object'],['objects it hits that aren’t being worn or carried','object'],['Nonmagical objects in the Cone that aren’t being worn or carried','object'],['Glass or crystal objects in the Cone that aren’t being worn or carried','object'],['one creature or object you can see within 20 feet of yourself','creatureOrObject'],['each creature and each object that isn’t being worn or carried in a 150-foot Cone','creatureOrObject'],['the creature with the object','creature'],['An object carried by a creature','object']] as const){const {source,op}=damage(recipient),bound=bindSourceOperations(source,[op]);expect(sourceOperationTargetType(source,bound[0]!)).toBe(expected);expect(bound[0]!.targetSpecial).toBe(recipient);}
    const unknown=damage('A target carrying an object');expect(sourceOperationTargetType(unknown.source,bindSourceOperations(unknown.source,[unknown.op])[0]!)).toBeUndefined();
  });
  for(const [recipient,expected]of [['the creature with the object','creature'],['An object carried by a creature','object'],['one creature or object','creatureOrObject']] as const)test('native target kind follows the receiver rather than qualification words: '+recipient,async()=>{
    const {source,op}=damage(recipient),{source:full,ir,markdown,actor}=await formal('fixed',header+'Actions\n'+source+'\n',source,()=>[op]),activity=Object.values(actor.items[0].system.activities)[0] as any;expect(activity.target.affects.type).toBe(expected);expect(activity.target.affects.special).toBe(recipient);
    const changed=structuredClone(actor);(Object.values(changed.items[0].system.activities)[0] as any).target.affects.type=expected==='creature'?'object':'creature';expect(verifyMonsterIntake(full,ir,markdown,changed).findings).toContainEqual(expect.objectContaining({code:'ACTOR_SOURCE_OPERATION_TARGET_DRIFT'}));
  });
});


describe('round eight model source gaps',()=>{
  for(const id of ['r17m-srd52-quasit-scare','r17r-deep-water','r17r-frigid-water','r17r-thin-ice','r17r-environmental-curses','r17r-extreme-heat','r17r-fire-casting-statue','r17r-poisoned-darts','r17r-potion-of-poison','r17r-talisman-of-pure-good'])test('complete frozen failed model parent: '+id,()=>{
    const parent=(roundEightRules.cases as any[]).find(c=>c.id===id),before=JSON.stringify(parent);
    for(const f of parent.features){if(!f.operations.length)continue;const bound=bindSourceOperations(f.text,f.operations);expect(sourceOperationErrors(f.text,bound)).toEqual([]);for(const op of bound){expect(op.sourceText).toBe(f.text);expect(op.evidence!.quote).toBe(f.text);expectSourceOperationProof(parent.source,op);}if(id.includes('quasit'))expect(bound.flatMap(op=>op.failureStatuses??[])).toEqual([]);}
    expect(JSON.stringify(parent)).toBe(before);
  });
});


describe('round eight narrow source guards',()=>{
  const parent=(id:string)=>(roundEightRules.cases as any[]).find(c=>c.id===id);
  const feature=(id:string)=>parent(id).features[0];
  const rewrite=(source:string,operations:any[],from:string,to:string)=>{
    const visit=(value:any):any=>typeof value==='string'?value.replaceAll(from,to):Array.isArray(value)?value.map(visit):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,visit(entry)])):value;
    return{source:source.replaceAll(from,to),operations:visit(operations)};
  };
  for(const id of ['r17m-srd52-quasit-scare','r17m-srd52-swarm-venomous-snakes-bites','r17r-extreme-heat','r17r-fire-casting-statue','r17r-poisoned-darts'])test('frozen numeric and lifecycle errors stay rejected: '+id,()=>{
    const p=parent(id),f=p.features[0];
    for(const probe of p.irProbes.filter((probe:any)=>probe.assign.sourceOperations)){
      expect(()=>bindSourceOperations(f.text,probe.assign.sourceOperations)).toThrow('InvalidSourceOperations');
      // A numeric/damage failure must survive beyond the separately asserted
      // frozen classification failure, using an explicitly new input variant.
      if(id==='r17m-srd52-swarm-venomous-snakes-bites')expect(()=>bindSourceOperations(f.text,newNeutralAttackContractVariant(probe.assign.sourceOperations,'melee'))).toThrow('InvalidSourceOperations');
    }
  });
  test('a closed replacement keeps only its actual common tail in both exclusive modes',()=>{
    const frozen=feature('r17m-srd52-swarm-venomous-snakes-bites');
    expect(()=>bindSourceOperations(frozen.text,frozen.operations)).toThrow('attack/type-or-bonus');
    const f={...frozen,operations:newNeutralAttackContractVariant(frozen.operations,'melee')};
    expect(sourceOperationErrors(f.text,bindSourceOperations(f.text,f.operations))).toEqual([]);
    for(const mutate of [(ops:any[])=>ops[1].damage.pop(),(ops:any[])=>ops[0].damage[1].formula='4d6',(ops:any[])=>ops[1].damage[1].relationship='replacement',(ops:any[])=>ops[0].damage[0].formula='1d4 + 4',(ops:any[])=>ops.push({...structuredClone(ops[1]),id:'copy'})]){
      const ops=structuredClone(f.operations);mutate(ops);expect(()=>bindSourceOperations(f.text,ops)).toThrow();
    }
    for(const [from,to]of [['—plus',' plus'],['—plus 10 (3d6) Poison damage','—plus 10 (3d6) Poison damage if the target is Poisoned']] as const){const other=rewrite(f.text,f.operations,from,to);expect(()=>bindSourceOperations(other.source,other.operations)).toThrow();}
  });
  test('literal profile rows keep damage and area coupled and cannot duplicate the shared Save',()=>{
    const f=feature('r17r-fire-casting-statue');
    for(const mutate of [(ops:any[])=>ops[1].aoe.radius=60,(ops:any[])=>ops[1].damage[0].type='cold',(ops:any[])=>ops[1].save.dc=16,(ops:any[])=>ops[1].relationship='follow-up',(ops:any[])=>ops.splice(2,1),(ops:any[])=>ops.push({...structuredClone(ops[1]),id:'copy'}),(ops:any[])=>ops[1].damage=[]]){
      const ops=structuredClone(f.operations);mutate(ops);expect(()=>bindSourceOperations(f.text,ops)).toThrow();
    }
    const ambiguous='Another target must make a DC 12 Wisdom saving throw. '+f.text;expect(()=>bindSourceOperations(ambiguous,f.operations)).toThrow('scaling-context');
  });
  test('per-item scaling preserves one literal roll per item and never borrows its count or another type',()=>{
    const f=feature('r17r-poisoned-darts');
    for(const mutate of [(ops:any[])=>ops[1].damage[0].formula='1d3',(ops:any[])=>ops[2].damage[0].formula='2d6 + 3',(ops:any[])=>ops[2].damage[0].type='piercing',(ops:any[])=>ops[2].damage[0].relationship='base',(ops:any[])=>ops.splice(3,1),(ops:any[])=>ops.push({...structuredClone(ops[2]),id:'copy'})]){
      const ops=structuredClone(f.operations);mutate(ops);expect(()=>bindSourceOperations(f.text,ops)).toThrow();
    }
    const other=f.text+' The wall resists Piercing damage.',ops=structuredClone(f.operations);ops[2].damage[0].type='piercing';expect(()=>bindSourceOperations(other,ops)).toThrow('negation-or-binding');
  });
  test('an adjacent first-period DC definition cannot become a timeless or unrelated fixed Save',()=>{
    const f=feature('r17r-extreme-heat'),primary=structuredClone(f.operations);primary[0].relationship='primary';expect(()=>bindSourceOperations(f.text,primary)).toThrow('conditional-definition');
    const interrupted=f.text.replace('The DC is 5','The sky is clear. The DC is 5');expect(()=>bindSourceOperations(interrupted,f.operations)).toThrow('dc-or-ability');
    expect(sourceFeatureBasicOmissions(f.text,{name:f.name,description:f.text,executionMode:'gm-manual',activityType:'utility'} as any)).toContain('source-operations-required');
  });
  test('elapsed activity is an event while static recipient eligibility still is not',()=>{
    for(const [prefix,event]of [['After each hour of swimming,',true],['Each additional minute spent in cold water',true],['Each creature that can swim',false],['For each creature you can see',false]] as const){
      const q=prefix+' the creature must make a DC 10 Constitution saving throw.',source='Water. '+q,op:any={id:'water',name:'Water',type:'save',relationship:'follow-up',save:{dc:10,abilities:['con'],choice:'single',outcome:'none'},proof:{save:q}};
      if(event)expect(()=>bindSourceOperations(source,[op])).not.toThrow();else expect(()=>bindSourceOperations(source,[op])).toThrow('relationship');
    }
  });
  test('repeat and automatic success lifetime stays on its own Save even with identical printed DCs',()=>{
    const q='Wisdom Saving Throw: DC 10, one creature.',source='First. '+q+' Failure: The target has the Prone condition. Second. '+q+' Failure: The target has the Frightened condition. At the end of each of its turns, the target repeats the save, ending the effect on itself on a success. After 1 minute, it succeeds automatically.';
    const ops:any[]=[{id:'first',name:'First',type:'save',relationship:'primary',save:{dc:10,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:q}},{id:'second',name:'Second',type:'save',relationship:'follow-up',save:{dc:10,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:q}}];
    const bound=bindSourceOperations(source,ops);expect(bound[0]!.failureStatuses).toEqual(['prone']);expect(bound[1]!.failureStatuses??[]).toEqual([]);
    const bad=structuredClone(ops);bad[1].failureStatuses=['frightened'];expect(()=>bindSourceOperations(source,bad)).toThrow('failureStatuses');
    expect(sourceFailedSaveStatuses('Failure: The target has the Prone condition. Success: The target is immune to this effect for 24 hours.')).toEqual(['prone']);
  });
  test('drinking damage and successful-save damage cannot move into the failed Save slot',()=>{
    const potion=feature('r17r-potion-of-poison'),ops=structuredClone(potion.operations);ops[1].damage=[{formula:'4d6',type:'poison',relationship:'base'}];ops[1].proof.damage=[ops[0].proof.damage[0]];ops.splice(0,1);expect(()=>bindSourceOperations(potion.text,ops)).toThrow('operation-owner');
    const talisman=feature('r17r-talisman-of-pure-good'),altered=structuredClone(talisman.operations),success=altered.pop(),save=altered.at(-1);save.damage=[{...success.damage[0],relationship:'base'}];delete save.damage[0].condition;save.proof.damage=success.proof.damage;expect(()=>bindSourceOperations(talisman.text,altered)).toThrow('save-success-must-separate');
  });
});


describe('round nine model source gaps',()=>{
  for(const id of ['r18m-srd52-constrictor-snake-constrict','r18m-srd52-fire-elemental-fire-form','r18r-armor-of-invulnerability','r18r-holy-nimbus','r18r-dust-of-sneezing-and-choking','r18r-energy-bow','r18r-hammer-of-thunderbolts','r18r-holy-water','r18r-mounted-combat'])test('complete frozen failed model parent: '+id,()=>{
    const parent=(roundNineRules.cases as any[]).find(c=>c.id===id),before=JSON.stringify(parent);
    for(const [index,f]of parent.features.entries()){
      if(f.operations.length){
        const bound=bindSourceOperations(f.text,f.operations);expect(sourceOperationErrors(f.text,bound)).toEqual([]);
        for(const op of bound){expect(op.sourceText).toBe(f.text);expect(op.evidence?.quote).toBe(f.text);}
        if(id.includes('constrictor'))expect(bound.flatMap(op=>op.failureStatuses??[])).toEqual([]);
        if(id.includes('hammer-of-thunderbolts'))expect(bound.map(op=>op.failureStatuses??[])).toEqual([[],['dead']]);
        if(id.includes('mounted-combat'))expect(bound[0]!.failureStatuses).toEqual(['prone']);
      }
      if(f.uses)expect(sourceFeatureResources(f.name,f.text,parent.creature.identity.name).uses).toEqual(f.uses);
      if(id.includes('holy-nimbus')&&index===1)expect(sourceFeatureResources(f.name,f.text,parent.creature.identity.name).uses).toBeUndefined();
    }
    expect(JSON.stringify(parent)).toBe(before);
  });
});


describe('round nine narrow source guards',()=>{
  const parent=(id:string)=>(roundNineRules.cases as any[]).find(c=>c.id===id);
  const feature=(id:string)=>parent(id).features[0];
  const rewrite=(source:string,operations:any[],from:string,to:string)=>{
    const visit=(value:any):any=>typeof value==='string'?value.replaceAll(from,to):Array.isArray(value)?value.map(visit):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,visit(entry)])):value;
    return{source:source.replaceAll(from,to),operations:visit(operations)};
  };
  for(const id of ['r18m-srd52-constrictor-snake-constrict','r18m-srd52-fire-elemental-fire-form','r18r-dust-of-sneezing-and-choking','r18r-energy-bow','r18r-hammer-of-thunderbolts','r18r-holy-water','r18r-mounted-combat'])test('frozen wrong model values remain rejected: '+id,()=>{
    const p=parent(id),f=p.features[0];
    for(const probe of p.irProbes.filter((probe:any)=>probe.assign.sourceOperations))expect(()=>bindSourceOperations(f.text,probe.assign.sourceOperations)).toThrow('InvalidSourceOperations');
  });
  test('escape and timed states stay GM while a direct landing and ordinary death keep their own failed recipient',()=>{
    const snake=feature('r18m-srd52-constrictor-snake-constrict'),wrong=structuredClone(snake.operations);wrong[0].failureStatuses=['grappled'];expect(()=>bindSourceOperations(snake.text,wrong)).toThrow('failureStatuses');
    expect(sourceFailedSaveStatuses('Failure: The target has the Grappled condition (escape DC 12).')).toEqual([]);
    expect(sourceFailedSaveStatuses('Failure: fall off, landing with the Prone condition in an unoccupied space.')).toEqual(['prone']);
    for(const result of ['Failure: fall off, landing with the Prone condition for 1 minute.','Failure: fall off, landing with the Prone condition until the end of your next turn.','Failure: Another creature lands with the Prone condition.','Failure: die if the target is a Giant.'])expect(sourceFailedSaveStatuses(result)).toEqual([]);
    expect(sourceFailedSaveStatuses('Failure: die.')).toEqual(['dead']);
    const hammer=feature('r18r-hammer-of-thunderbolts');
    for(const change of [(ops:any[])=>ops[0].failureStatuses=['stunned'],(ops:any[])=>ops[0].failureStatuses=['dead'],(ops:any[])=>ops[1].failureStatuses=[]]){const ops=structuredClone(hammer.operations);change(ops);expect(()=>bindSourceOperations(hammer.text,ops)).toThrow('failureStatuses');}
  });
  test('a primary conditional GM roll needs its real event and cannot execute modal capacity or incoming mitigation',()=>{
    const f=feature('r18m-srd52-fire-elemental-fire-form');
    for(const [from,to]of [['The first time it enters','The first time it can enter'],['The first time it enters','The first time it does not enter']] as const){const other=rewrite(f.text,f.operations,from,to);expect(()=>bindSourceOperations(other.source,other.operations)).toThrow();}
    const q='The first time a creature hits you on a turn, reduce the damage it takes by 1d10 Fire damage.',op:any={id:'input',name:'Input',type:'damage',relationship:'primary',damage:[{formula:'1d10',type:'fire',relationship:'conditional'}],proof:{damage:[q]}};
    expect(()=>bindSourceOperations('Guard. '+q,[op])).toThrow('negation-or-binding');
    const bound=bindSourceOperations(f.text,f.operations),bad=structuredClone(bound);bad[0]!.condition='The first time it enters';expect(sourceOperationErrors(f.text,bad)).toContain('0/damage/0/condition');
  });
  test('a forced AND receiver keeps both the acting creature and the complete nearby group',()=>{
    const f=feature('r18r-dust-of-sneezing-and-choking');
    for(const targetSpecial of ['yourself','every creature in a 30-foot Emanation originating from you','a 30-foot Emanation']){const ops=structuredClone(f.operations);ops[0].targetSpecial=targetSpecial;expect(()=>bindSourceOperations(f.text,ops)).toThrow('targetSpecial');}
  });
  test('hit-target anaphora cannot borrow the source weapon or skip an intervening rule',()=>{
    const f=feature('r18r-energy-bow'),ops=structuredClone(f.operations);ops[0].targetSpecial='this weapon';expect(()=>bindSourceOperations(f.text,ops)).toThrow('targetSpecial');
    const interrupted=f.text.replace('If the arrow hits,','The bow sheds light. If the arrow hits,');expect(()=>bindSourceOperations(interrupted,f.operations)).toThrow('targetSpecial');
    const hammer=feature('r18r-hammer-of-thunderbolts'),wrong=structuredClone(hammer.operations);wrong[1].targetSpecial='this weapon';expect(()=>bindSourceOperations(hammer.text,wrong)).toThrow('targetSpecial');
  });
  test('a dynamic Save result qualification stays complete and cannot borrow the DC formula as its receiver',()=>{
    const f=feature('r18r-holy-water');
    for(const targetSpecial of ['a Fiend','an Undead','your Dexterity modifier and Proficiency Bonus']){const ops=structuredClone(f.operations);ops[0].targetSpecial=targetSpecial;expect(()=>bindSourceOperations(f.text,ops)).toThrow('targetSpecial');}
    const wrong=structuredClone(f.operations);wrong[0].range=8;expect(()=>bindSourceOperations(f.text,wrong)).toThrow('range');
  });
  test('one activated cooldown among passive benefits cannot acquire another action, cooldown or owner',()=>{
    for(const id of ['r18r-armor-of-invulnerability','r18r-holy-nimbus']){
      const f=feature(id);expect(sourceFeatureResources('Another Feature',f.text).uses).toBeUndefined();
      for(const extra of [' As a Magic action, you can make a different light.',' Once used, this property cannot be used again until the next dawn.',' This property has 3 charges.'])expect(sourceFeatureResources(f.name,f.text+extra).uses).toBeUndefined();
      expect(sourceFeatureResources('Holy Ward',f.text).uses).toBeUndefined();
    }
    const nimbus=parent('r18r-holy-nimbus');expect(sourceFeatureResources(nimbus.features[1].name,nimbus.features[1].text).uses).toBeUndefined();
    const f=nimbus.features[0];expect(sourceFeatureResources(f.name,f.text).uses).not.toEqual({max:5,period:'longRest'});
    expect(sourceFeatureResources(f.name,f.text.replace('until you finish a Long Rest.','until you finish a Long Rest unless you are angry.')).uses).toBeUndefined();
  });
});


describe('round nine range and roll dependencies',()=>{
  test('existing distinct range evidence remains inside its named operation',()=>{
    for(const fixture of [roundFiveRules,roundSixRules,roundSevenRules,roundEightRules,roundNineRules])for(const parent of fixture.cases as any[])for(const f of parent.features){
      if(!f.operations.some((op:any)=>op.range!==undefined&&op.proof.range!==(op.type==='save'?op.proof.save:op.type==='attack'?op.proof.attack:op.proof.damage?.[0])))continue;
      expect(sourceOperationErrors(f.text,bindSourceOperations(f.text,f.operations))).toEqual([]);
    }
  });
  test('an actual numeric die-roll event is distinct from a static attack-roll property',()=>{
    for(const [prefix,event]of [['When you roll a 20 on the d20 for an attack roll,',true],['Each creature whose attack roll is higher than 10',false]] as const){
      const q=prefix+' the creature must make a DC 15 Constitution saving throw.',source='Roll. '+q,op:any={id:'roll',name:'Roll',type:'save',relationship:'follow-up',save:{dc:15,abilities:['con'],choice:'single',outcome:'none'},proof:{save:q}};
      if(event)expect(()=>bindSourceOperations(source,[op])).not.toThrow();else expect(()=>bindSourceOperations(source,[op])).toThrow('relationship');
    }
  });
});


describe('round nine named range boundary followup',()=>{
  const save='The target must make a DC 12 Strength saving throw.';
  const op=(saveQuote:string,rangeQuote:string,range=20):any=>({id:'restraint',name:'Restraint',type:'save',relationship:'primary',save:{dc:12,abilities:['str'],choice:'single',outcome:'none'},range,proof:{save:saveQuote,range:rangeQuote}});
  test('a colon-style named property cannot lend range to the preceding Save',()=>{
    const range='Arrow of Transport: You teleport to a point within 60 feet.',source='Bow. Arrow of Restraint. '+save+'\n'+range;
    expect(()=>bindSourceOperations(source,[op(save,range,60)])).toThrow('range/operation-owner');
  });
  test('adjacent same-property range and standard context labels remain valid',()=>{
    for(const range of ['The target is within 20 feet.','Target: one creature within 20 feet.','Trigger: a creature comes within 20 feet.','Response: the target is within 20 feet.','Range: 20 feet.']){
      const source='Bow. Arrow of Restraint. '+save+' '+range;expect(sourceOperationErrors(source,bindSourceOperations(source,[op(save,range)]))).toEqual([]);
    }
    const range='Target: one creature within 20 feet.',reverse='Strength Saving Throw: DC 12, one creature.',source='Bow. Arrow of Restraint. '+range+' '+reverse;
    expect(sourceOperationErrors(source,bindSourceOperations(source,[op(reverse,range)]))).toEqual([]);
  });
  test('the existing period-style EnergyBow property range cannot cross backward',()=>{
    const p=(roundNineRules.cases as any[]).find(c=>c.id==='r18r-energy-bow'),f=p.features[0],probe=p.irProbes.find((probe:any)=>probe.assign.sourceOperations?.some((op:any)=>op.range===60));
    expect(probe).toBeDefined();expect(()=>bindSourceOperations(f.text,probe.assign.sourceOperations)).toThrow('range/operation-owner');
  });
});


describe('round ten model source gaps',()=>{
  for(const id of ['r19r-befuddlement','r19r-bestow-curse','r19r-chromatic-orb','r19r-conjure-celestial','r19r-conjure-elemental','r19r-contact-other-plane','r19r-control-water','r19r-delayed-blast-fireball','r19r-dissonant-whispers','r19r-dream','r19r-earthquake','r19r-freezing-sphere','r19r-prismatic-wall','r19r-symbol','r19r-tsunami','r19r-wall-of-ice'])test('complete frozen failed model parent: '+id,()=>{
    const p=(roundTenRules.cases as any[]).find(c=>c.id===id),before=JSON.stringify(p);
    for(const f of p.features){const bound=bindSourceOperations(f.text,f.operations);expect(sourceOperationErrors(f.text,bound)).toEqual([]);for(const op of bound){expect(op.sourceText).toBe(f.text);expect(op.evidence?.quote).toBe(f.text);}}
    expect(JSON.stringify(p)).toBe(before);
  });
});


describe('round ten spell header facts',()=>{
  test('complete printed first-clause numeric metadata remains distinct from an OP owner proof',()=>{
    for(const [id,range]of [['r19r-befuddlement',150],['r19r-chromatic-orb',90],['r19r-conjure-celestial',90],['r19r-delayed-blast-fireball',150],['r19r-dissonant-whispers',60],['r19r-earthquake',500],['r19r-freezing-sphere',300]] as const){
      const p=(roundTenRules.cases as any[]).find(c=>c.id===id),f=p.features[0],op=f.operations[0];expect(sourceSpellHeaderRange(f.text,sourceOperationClauses(f.text)[0]!)).toBe(range);
      expect(sourceSpellHeaderRange(f.text,op.proof.damage[0])).toBeUndefined();
    }
    const p=(roundNineRules.cases as any[]).find(c=>c.id==='r18r-energy-bow'),f=p.features[0],probe=p.irProbes.find((probe:any)=>probe.assign.sourceOperations?.some((op:any)=>op.range===60));expect(sourceSpellHeaderRange(f.text,probe.assign.sourceOperations[0].proof.range)).toBeUndefined();
  });
});


describe('round ten explicit self recipient facts',()=>{
  test('an explicit self Save and own drinking results differ from foreign and qualified recipients',()=>{
    const contact=(roundTenRules.cases as any[]).find(c=>c.id==='r19r-contact-other-plane').features[0],self=bindSourceOperations(contact.text,contact.operations);expect(sourceOperationSelfTarget(contact.text,self[0]!)).toBe(true);
    const potion=(roundEightRules.cases as any[]).find(c=>c.id==='r17r-potion-of-poison').features[0],own=bindSourceOperations(potion.text,potion.operations);expect(own.map(op=>sourceOperationSelfTarget(potion.text,op))).toEqual([true,true]);
    const snake=(roundNineRules.cases as any[]).find(c=>c.id==='r18m-srd52-constrictor-snake-constrict').features[0],foreign=bindSourceOperations(snake.text,snake.operations);expect(sourceOperationSelfTarget(snake.text,foreign[0]!)).toBe(false);
    const dust=(roundNineRules.cases as any[]).find(c=>c.id==='r18r-dust-of-sneezing-and-choking').features[0],group=bindSourceOperations(dust.text,dust.operations);expect(sourceOperationSelfTarget(dust.text,group[0]!)).toBe(false);
  });
});


describe('round ten typed and receiver guards',()=>{
  const feature=(id:string)=>(roundTenRules.cases as any[]).find(c=>c.id===id).features[0];
  test('chosen-type references preserve the explicit ordered choices and never borrow unknown or later selectors',()=>{
    for(const id of ['r19r-chromatic-orb','r19r-conjure-elemental']){
      const f=feature(id);expect(sourceOperationErrors(f.text,bindSourceOperations(f.text,f.operations))).toEqual([]);
      for(const mutate of [(ops:any[])=>ops[0].damage[0].types.reverse(),(ops:any[])=>ops[0].damage[0].types.pop(),(ops:any[])=>{ops[0].damage[0].type='radiant';ops[0].damage[0].types=['radiant'];}]){const ops=structuredClone(f.operations);mutate(ops);expect(()=>bindSourceOperations(f.text,ops)).toThrow('negation-or-binding');}
    }
    const f=feature('r19r-chromatic-orb'),choice=sourceOperationClauses(f.text).find(q=>q.startsWith('Choose Acid'))!,damage=f.operations[0].proof.damage[0],later=f.text.replace(choice+' ','').replace(damage,damage+' '+choice);
    expect(()=>bindSourceOperations(later,f.operations)).toThrow('negation-or-binding');
  });
  test('an explicit new target and new damage instruction can project the roll once and cannot duplicate or borrow actor range',()=>{
    const f=feature('r19r-chromatic-orb');
    for(const mutate of [(ops:any[])=>ops.push({...structuredClone(ops[1]),id:'copy'}),(ops:any[])=>{ops[1].proof.target=ops[0].proof.target;ops[1].targetSpecial=ops[0].targetSpecial;},(ops:any[])=>{ops[1].range=30;ops[1].proof.range=ops[1].proof.target;}]){const ops=structuredClone(f.operations);mutate(ops);expect(()=>bindSourceOperations(f.text,ops)).toThrow();}
    const source=f.text.replace('Make an attack roll against the new target, and make a new damage roll.','The orb sheds light.');expect(()=>bindSourceOperations(source,f.operations)).toThrow('targetSpecial');
  });
  test('typed reference damage still rejects input mitigation and negated output',()=>{
    for(const q of ['When you are hit, reduce the damage it takes by 3d8 damage of the chosen type.','When you are hit, you cannot take 3d8 damage of the chosen type.']){
      const source='Guard. Choose Acid or Cold for the type of shield. '+q,op:any={id:'guard',name:'Guard',type:'damage',relationship:'follow-up',damage:[{formula:'3d8',type:'acid',types:['acid','cold'],relationship:'conditional'}],proof:{damage:[q]}};
      expect(()=>bindSourceOperations(source,[op])).toThrow('negation-or-binding');
    }
  });
  test('a generic Saving Throw identifies its receiver without guessing a DC from the spell level',()=>{
    const f=feature('r19r-befuddlement'),ops=structuredClone(f.operations),save=sourceOperationClauses(f.text).find(q=>q==='The target makes an Intelligence saving throw.')!;
    ops[0].type='save';ops[0].save={dc:8,abilities:['int'],choice:'single',outcome:'half'};ops[0].proof.save=save;ops[0].damage[0].relationship='base';expect(()=>bindSourceOperations(f.text,ops)).toThrow('save/dc-or-ability');
  });
  test('a completed sensory qualification does not turn an actual entry into modal capacity',()=>{
    for(const [prefix,event]of [['Whenever a creature you can see enters the area,',true],['For each creature you can see,',false]] as const){const q=prefix+' that creature must make a DC 14 Constitution saving throw.',source='Entry. '+q,op:any={id:'entry',name:'Entry',type:'save',relationship:'follow-up',save:{dc:14,abilities:['con'],choice:'single',outcome:'none'},proof:{save:q}};if(event)expect(()=>bindSourceOperations(source,[op])).not.toThrow();else expect(()=>bindSourceOperations(source,[op])).toThrow('relationship');}
  });
  test('a target declared in the header body cannot become a material component recipient',()=>{
    const f=feature('r19r-befuddlement'),ops=structuredClone(f.operations);ops[0].targetSpecial='a key ring with no keys';expect(()=>bindSourceOperations(f.text,ops)).toThrow('targetSpecial');
  });
  test('an object destruction threshold is not an outgoing damage primitive',()=>{
    const f=feature('r19r-prismatic-wall'),q=sourceOperationClauses(f.text).find(q=>q.includes('destroyed if it takes at least 25 Cold damage'))!,op:any={id:'threshold',name:'Threshold',type:'damage',relationship:'follow-up',damage:[{formula:'25',type:'cold',relationship:'conditional'}],proof:{damage:[q]}};
    expect(sourceOperationErrors(f.text,materializeSourceOperationEvidence(f.text,[op]))).toContain('0/damage/0/negation-or-binding');
  });
});


describe('round ten source area and presentation facts',()=>{
  test('explicit actor Emanations and first standard monster Cone or Line headers keep their source origin',()=>{
    for(const [fixture,id]of [[roundThreeRules,'r12m-srd52-tarrasque-thunderous-bellow'],[roundFourRules,'r13m-srd52-fire-elemental-fire-aura'],[roundSevenRules,'r16m-srd52-adult-silver-dragon-cold-gale'],[roundSevenRules,'r16r-thunderous-greatclub'],[roundNineRules,'r18m-srd52-hezrou-stench'],[roundNineRules,'r18r-dust-of-sneezing-and-choking'],[roundSixRules,'r15r-horn-of-blasting']] as const){
      const p=(fixture.cases as any[]).find(c=>c.id===id);for(const f of p.features)for(const op of f.operations.filter((op:any)=>op.aoe&&op.range===undefined))expect({case:id,op:op.id,self:sourceOperationSelfArea(f.text,op,p.creature.identity.name)}).toEqual({case:id,op:op.id,self:true});
    }
  });
  test('foreign emitters and placed glyphs cannot become self and an earlier body breaks the first-header convention',()=>{
    for(const [fixture,id]of [[roundEightRules,'r17r-fire-casting-statue'],[roundTenRules,'r19r-symbol']] as const){const p=(fixture.cases as any[]).find(c=>c.id===id);for(const f of p.features)for(const op of f.operations.filter((op:any)=>op.aoe))expect(sourceOperationSelfArea(f.text,op,p.creature.identity.name)).toBe(false);}
    const p=(roundThreeRules.cases as any[]).find(c=>c.id==='r12m-srd52-tarrasque-thunderous-bellow'),f=p.features[0],op=f.operations[0],foreign=f.text.replace(op.proof.save,'A nearby statue exhales a cone. '+op.proof.save);expect(sourceOperationSelfArea(foreign,op,p.creature.identity.name)).toBe(false);
  });
  test('space and legacy bilingual presentation retain the full of-name identity',()=>{
    for(const name of ['中文 Sphinx of Valor','中文 (Sphinx of Valor)','中文（Sphinx of Valor）'])expect(sourceActorNameMatches('Sphinx of Valor',name)).toBe(true);
  });
  test('an authored English qualifier is not a head-name alias',()=>{
    expect(sourceActorNameMatches('Dragon','Dragon Summoner (Dragon)')).toBe(false);expect(sourceActorNameMatches('Dragon','Dragon Summoner')).toBe(false);expect(sourceActorNameMatches('Summoner','Dragon Summoner')).toBe(true);expect(sourceActorNameMatches('Dragon Summoner (Dragon)','Dragon Summoner (Dragon)')).toBe(true);expect(sourceActorNameMatches('dragon','Ancient Black Dragon (Shadow Form)')).toBe(true);
  });
});


describe('round ten existing external area facts',()=>{
  const feature=(id:string)=>(roundTenRules.cases as any[]).find(c=>c.id===id).features[0];
  const reused=['r19r-conjure-celestial','r19r-earthquake','r19r-freezing-sphere'];
  test('actual later area events preserve a proved initial area and never become self',()=>{
    for(const id of reused){
      const f=feature(id),ops=bindSourceOperations(f.text,f.operations);
      expect(sourceOperationExistingArea(f.text,ops,0)).toBeUndefined();
      expect(sourceOperationExistingArea(f.text,ops,1)).toEqual({special:ops[1]!.proof.target!});
      expect(sourceOperationSelfArea(f.text,ops[1]!)).toBe(false);
      if(id==='r19r-earthquake')expect(sourceOperationTargetType(f.text,ops[1]!)).toBe('object');
    }
  });
  test('missing, reversed, duplicated, altered or unqualified area applications cannot establish reuse',()=>{
    for(const id of reused){
      const f=feature(id),ops=bindSourceOperations(f.text,f.operations);
      expect(sourceOperationExistingArea(f.text,[ops[1]!],0)).toBeUndefined();
      expect(sourceOperationExistingArea(f.text,[ops[1]!,ops[0]!],0)).toBeUndefined();
      expect(sourceOperationExistingArea(f.text,[ops[0]!,ops[1]!,{...ops[1]!,id:'copy'}],2)).toBeUndefined();
      for(const change of [(items:any[])=>{items[0].aoe.radius+=1;},(items:any[])=>{items[1].aoe.radius+=1;},(items:any[])=>{items[1].damage[0].formula='999d6';},(items:any[])=>{items[1].range=items[0].range;items[1].proof.range=items[0].proof.range;},(items:any[])=>{items[1].targetSpecial=items[0].targetSpecial;items[1].proof.target=items[0].proof.target;}]){
        const bad=structuredClone(ops);change(bad);expect(sourceOperationExistingArea(f.text,bad,1)).toBeUndefined();expect(()=>bindSourceOperations(f.text,bad)).toThrow();
      }
    }
  });
  test('a single deferred base calculator proves its own explosion without inventing its accumulated total or creation range',()=>{
    const f=feature('r19r-delayed-blast-fireball'),ops=bindSourceOperations(f.text,f.operations),op=ops[0]!;
    expect(sourceOperationExistingArea(f.text,ops,0)).toEqual({special:op.proof.target!});expect(sourceOperationSelfArea(f.text,op)).toBe(false);
    expect(op.range).toBeUndefined();expect(op.damage).toEqual([{formula:'12d6',type:'fire',relationship:'conditional',condition:f.text}]);
    const wrongRange=structuredClone(ops);wrongRange[0]!.range=150;wrongRange[0]!.proof.range=sourceOperationClauses(f.text)[0]!;
    expect(sourceOperationExistingArea(f.text,wrongRange,0)).toBeUndefined();expect(()=>bindSourceOperations(f.text,wrongRange)).toThrow('range/creation-only');
    expect(sourceOperationExistingArea(f.text,[op,{...op,id:'copy'}],0)).toBeUndefined();expect(()=>bindSourceOperations(f.text,[op,{...op,id:'copy'}])).toThrow();
    for(const formula of ['13d6','1d6']){const bad=structuredClone(ops);bad[0]!.damage![0]!.formula=formula;expect(()=>bindSourceOperations(f.text,bad)).toThrow('negation-or-binding');}
  });
});


describe('round ten header geometry operation ownership followup',()=>{
  for(const [id,probe]of [['r19r-conjure-elemental','spirit-placement-sixty-not-damage-target-range'],['r19r-control-water','outer-control-cube-not-whirlpool-damage-area'],['r19r-wall-of-ice','wall-placement-not-cut-victim-distance']] as const)test('creation metadata cannot become the current damage geometry: '+id,()=>{
    const p=(roundTenRules.cases as any[]).find(c=>c.id===id),f=p.features[0],wrong=p.irProbes.find((item:any)=>item.id===probe).assign.sourceOperations;
    expect(sourceOperationErrors(f.text,bindSourceOperations(f.text,f.operations))).toEqual([]);
    expect(()=>bindSourceOperations(f.text,wrong)).toThrow(/(?:range|aoe)\/operation-owner/u);
  });
});


describe('round ten integration source scope followup',()=>{
  test('a present-tense extending cloud keeps its actual Actor origin and rejects a foreign origin',()=>{
    for(const [subject,actor,self]of [['Sentinel','Sentinel',true],['the hag','Cloaker',false],['another Sentinel','Sentinel',false]] as const){
      const area=`A 20-foot-radius cloud extends from ${subject}.`,roll='Each creature in the area must make a DC 14 Dexterity saving throw.',source='Cloud Pulse. '+area+' '+roll;
      const op:any={id:'save',name:'GM Save',type:'save',relationship:'primary',save:{dc:14,abilities:['dex'],choice:'single',outcome:'none'},aoe:{shape:'radius',radius:20},proof:{save:roll,aoe:area}};
      expect(sourceOperationSelfArea(source,op,actor)).toBe(self);
    }
  });
});


describe('round eleven model source gaps',()=>{
  for(const id of ['r20r-radiant-strikes','r20r-overchannel','r20r-acid-arrow','r20r-arcane-hand','r20r-black-tentacles','r20r-call-lightning','r20r-cloudkill','r20r-dimension-door','r20r-disintegrate','r20r-dragon-s-breath','r20r-faithful-hound','r20r-finger-of-death','r20r-fire-shield','r20r-forbiddance','r20r-ice-storm'])test('complete frozen failed model parent: '+id,()=>{
    const p=(roundElevenRules.cases as any[]).find(c=>c.id===id),before=JSON.stringify(p);
    for(const f of p.features){const ops=bindSourceOperations(f.text,f.operations);expect(sourceOperationErrors(f.text,ops)).toEqual([]);for(const op of ops)expect(op.sourceText).toBe(f.text);}
    expect(JSON.stringify(p)).toBe(before);
  });
});


describe('round eleven shared casting and resource facts',()=>{
  for(const id of ['r20r-blessed-healer','r20r-casting-spells'])test('generic casting modifiers are not named spell actions: '+id,()=>{
    const p=(roundElevenRules.cases as any[]).find(c=>c.id===id);for(const f of p.features)expect(sourceSingleSpellAction(f.text)).toBeUndefined();
  });
  for(const id of ['r20r-sorcery-incarnate','r20r-arcane-apotheosis','r20r-magical-cunning','r20r-periapt-of-health'])test('the complete source retains its own independent resource: '+id,()=>{
    const p=(roundElevenRules.cases as any[]).find(c=>c.id===id);for(const f of p.features.filter((f:any)=>f.uses))expect(sourceFeatureResources(f.name,f.text).uses).toEqual(f.uses);
  });
});


describe('round eleven shared fact direction guards',()=>{
  test('printed header body is only a fact and preserves the actual first body',()=>{
    const p=(roundTenRules.cases as any[]).find(c=>c.id==='r19r-befuddlement');expect(sourceSpellHeaderBody(p.features[0].text)).toBe('You blast the mind of a creature that you can see within range.');expect(sourceSpellHeaderBody('Bow. Arrow of Transport: You teleport within 60 feet.')).toBeUndefined();
  });
  test('lowercase named objects still grant single spells and bare modifiers do not',()=>{
    for(const name of ['fireball','alarm'])expect(sourceSingleSpellAction('Spell. The creature casts '+name+', using Wisdom as its spellcasting ability.')?.name).toBe(name);
    for(const phrase of ['The healing spells you cast on others heal you as well.','The spell takes ten minutes longer to cast than normal.'])expect(sourceSingleSpellAction(phrase)).toBeUndefined();
  });
  test('second-person frequencies remain bound to their exact complete feature and unconditional quota',()=>{
    const p=(roundElevenRules.cases as any[]).find(c=>c.id==='r20r-sorcery-incarnate'),f=p.features.find((f:any)=>f.uses);expect(sourceFeatureResources('Other Feature',f.text).uses).toBeUndefined();
    for(const replace of ['The target can use this feature twice','Your ally can use this feature twice','You can use this feature twice if you are outdoors'])expect(sourceFeatureResources(f.name,f.text.replace('You can use this feature twice',replace)).uses).toBeUndefined();
  });
});


describe('round eleven narrow source guards',()=>{
  const ids=['r20r-radiant-strikes','r20r-overchannel','r20r-acid-arrow','r20r-arcane-hand','r20r-black-tentacles','r20r-call-lightning','r20r-cloudkill','r20r-dimension-door','r20r-disintegrate','r20r-dragon-s-breath','r20r-faithful-hound','r20r-finger-of-death','r20r-fire-shield','r20r-forbiddance','r20r-ice-storm'];
  for(const id of ids)test('frozen erroneous native primitives remain rejected: '+id,()=>{
    const p=(roundElevenRules.cases as any[]).find(c=>c.id===id),f=p.features[0];for(const probe of p.irProbes.filter((probe:any)=>probe.assign.sourceOperations))expect(()=>bindSourceOperations(f.text,probe.assign.sourceOperations),probe.id).toThrow();
  });
  test('one explicit slot-level unit is self while the jointly damaged travelers are not self alone',()=>{
    for(const [id,self]of [['r20r-overchannel',true],['r20r-dimension-door',false]] as const){const p=(roundElevenRules.cases as any[]).find(c=>c.id===id),f=p.features[0],ops=bindSourceOperations(f.text,f.operations);expect(sourceOperationSelfTarget(f.text,ops[0]!)).toBe(self);}
  });
  test('the actual selected strike point and the exhaler establish distinct external origins',()=>{
    for(const id of ['r20r-call-lightning','r20r-dragon-s-breath']){const p=(roundElevenRules.cases as any[]).find(c=>c.id===id),f=p.features[0],ops=bindSourceOperations(f.text,f.operations);expect(sourceOperationExistingArea(f.text,ops,0)).toBeDefined();expect(sourceOperationSelfArea(f.text,ops[0]!,p.creature.identity.name)).toBe(false);}
  });
});


describe('round eleven atomic and external direction guards',()=>{
  const feature=(id:string)=>(roundElevenRules.cases as any[]).find(c=>c.id===id).features[0];
  test('a joint traveler result cannot omit either direct affected receiver',()=>{
    const f=feature('r20r-dimension-door');for(const targetSpecial of ['you','any creature traveling with you']){const ops=structuredClone(f.operations);ops[0].targetSpecial=targetSpecial;expect(()=>bindSourceOperations(f.text,ops)).toThrow('targetSpecial');}
  });
  test('an explicit self cost is a slot-level unit rather than a guessed total or a resource pool',()=>{
    const f=feature('r20r-overchannel'),ops=bindSourceOperations(f.text,f.operations);expect(sourceOperationSelfTarget(f.text,ops[0]!)).toBe(true);expect(ops[0]!.damage![0]!.formula).toBe('2d12');expect(ops[0]!.condition).toBe(f.text);expect(sourceFeatureResources(f.name,f.text).uses).toBeUndefined();
    const wrong=structuredClone(f.operations);wrong[0].damage[0].formula='10d12';expect(()=>bindSourceOperations(f.text,wrong)).toThrow();
  });
  test('the same type-choice roll cannot hide unequal mode dice or a negated choice',()=>{
    const shield=feature('r20r-fire-shield'),text=shield.text.replace('2d8 Cold damage from a chill shield','3d8 Cold damage from a chill shield'),ops=structuredClone(shield.operations);ops[0].proof.damage[0]=ops[0].proof.damage[0].replace('2d8 Cold','3d8 Cold');expect(()=>bindSourceOperations(text,ops)).toThrow();
    const breath=feature('r20r-dragon-s-breath');expect(()=>bindSourceOperations(breath.text.replace('and choose Acid','and cannot choose Acid'),breath.operations)).toThrow('negation-or-binding');
  });
  test('an external point or exhaler fact needs its own actual adjacent source context',()=>{
    for(const id of ['r20r-call-lightning','r20r-dragon-s-breath']){const f=feature(id),ops=bindSourceOperations(f.text,f.operations),source=id==='r20r-call-lightning'?f.text.replace('A lightning bolt shoots from the cloud to that point.','A beam lights up another object.'):f.text.replace('You touch one willing creature, and choose','You study one distant object, and choose');const updated=materializeSourceOperationEvidence(source,f.operations) as SourceOperation[];expect(sourceOperationExistingArea(source,updated,0)).toBeUndefined();expect(sourceOperationExistingArea(f.text,ops,0)).toBeDefined();}
  });
});
