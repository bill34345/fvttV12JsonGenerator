import {describe,expect,test} from 'bun:test';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {bindSourceOperations,sourceOperationErrors,sourceOperationClauses,sourceFeatureBasicOmissions,sourceFeatureResources,sourceAttackTargetClause} from '@fvtt-json-generator/models/source-operations';
import {sourceResourcePoolErrors} from '@fvtt-json-generator/models/source-resource-pools';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {bindProviderSourceContracts,FULL_IR_SOURCE_OPERATION_CONTRACT} from '../packages/intake-ai/src/source-operation-contract';
import {mixedFeatureSourceMatches} from '../packages/intake-ai/src/staged-feature-mechanics';
import {validateStagedStaticSourceFacts} from '../packages/intake-ai/src/staged-source-facts';
import {runStagedMonsterExtraction} from '../packages/intake-ai/src/staged-extraction';
import {splitStagedMonsterSource} from '../packages/intake-ai/src/staged-source';
import {stagedSpellcastingGroups} from '../packages/intake-ai/src/staged-spellcasting';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {createBrowserAiProvider,analyzeBrowserActorSourceWithAi,repairBrowserActorIntake,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import recorded from './fixtures/forge-ordinary-protocol-failures.json';
import cloaker from './fixtures/cloaker-srd51-boundary.json';
import {completeSourceFeatureEvidence} from '../packages/intake-ai/src/source-completeness';

const request=(source:string)=>({source,sourceSha256:hashSource(source),candidate:{id:'source',label:'Source',start:0,end:source.length,quote:source}});
const header=cloaker.source.slice(0,cloaker.source.indexOf('Damage Transfer.'));
const creature={identity:{name:'Cloaker',size:'large',creatureType:'aberration',alignment:'chaotic neutral'},abilities:{str:17,dex:15,con:12,int:13,wis:12,cha:14},attributes:{ac:14,acKind:'natural',hp:{value:78,formula:'12d10+12'},movement:{walk:10,fly:40},cr:8,xp:3900},saves:{},skills:{stealth:5},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{darkvision:60,passivePerception:11},languages:{values:['deep','undercommon']}};
const rawOrdinary=()=>JSON.parse(recorded.ordinary.content);

describe('ordinary source-bound Attack target fragments',()=>{
  const cases=[
    {name:'针刺',englishName:'Needle',source:'近战武器攻击: 命中+5，触及5尺，单一目标。命中：1d6穿刺伤害。',attack:{type:'mwak',toHit:5,reach:5},target:'单一目标'},
    {name:'光矢',englishName:'Light Bolt',source:'远程法术攻击: 命中+6，射程120尺，单一目标。命中：2d6力场伤害。',attack:{type:'rsak',toHit:6,range:120},target:'单一目标'},
    {name:'Blade',source:'Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 1d6 slashing damage.',attack:{type:'mwak',toHit:4,reach:5},target:'one creature'},
    {name:'Ray',source:'Ranged Spell Attack: +7 to hit, range 60/120 ft., one target it can see. Hit: 2d6 fire damage.',attack:{type:'rsak',toHit:7,range:60,longRange:120},target:'one target it can see'},
  ];
  function fixture(row=cases[0]!){
    const description=row.source,source=`${row.name}${row.englishName?' '+row.englishName:''}. ${description}`,evidence={start:0,end:source.length,quote:source};
    const feature={name:row.name,...(row.englishName?{englishName:row.englishName}:{}),description,activityType:'attack',attack:row.attack,targetSpecial:row.target,evidence:[evidence]};
    const ir:any={schemaVersion:1,source:{sha256:hashSource(source),length:source.length},creature:{...structuredClone(creature),traits:[],actions:[feature],bonusActions:[],reactions:[],legendaryActions:[]},claims:[{path:'/creature/actions/0',valueKind:'explicit',confidence:'high',evidence:[evidence]}],coverage:[{...evidence,classification:'mechanical',claimPaths:['/creature/actions/0']}],uncertainties:[]};
    return{source,ir,feature,evidence};
  }
  const targetFindings=(data:ReturnType<typeof fixture>)=>validateMonsterIntakeIR(data.source,data.ir).findings.filter(f=>f.code==='UNBOUND_FEATURE_TARGET');
  test('source-exact normal target fragments use their own complete Attack rather than numbered placement inheritance',()=>{
    for(const row of cases){const data=fixture(row);expect(completeSourceFeatureEvidence(data.source,data.ir,data.feature as any,'/creature/actions/0')).toEqual(data.evidence);expect(targetFindings(data)).toEqual([]);expect(data.feature.targetSpecial).toBe(row.target);}
  });
  test('explicit target claims must belong to the exact same Attack, not merely a true neighboring quote',()=>{
    const valid=fixture();valid.ir.claims.push({path:'/creature/actions/0/targetSpecial',value:valid.feature.targetSpecial,valueKind:'explicit',confidence:'high',evidence:[valid.evidence]});expect(targetFindings(valid)).toEqual([]);
    for(const change of ['value','quote','offset','partial','foreign'] as const){const data=fixture(),claim:any={path:'/creature/actions/0/targetSpecial',value:data.feature.targetSpecial,valueKind:'explicit',confidence:'high',evidence:[{...data.evidence}]};data.ir.claims.push(claim);
      if(change==='value')claim.value='two targets';if(change==='quote')claim.evidence[0].quote+='wrong';if(change==='offset')claim.evidence[0].start++;if(change==='partial'){const start=data.source.indexOf(data.feature.targetSpecial);claim.evidence=[{start,end:start+data.feature.targetSpecial.length,quote:data.feature.targetSpecial}];}if(change==='foreign'){const neighbor='\nOther. '+cases[1]!.source,start=data.source.length+1;data.source+=neighbor;claim.evidence=[{start,end:data.source.length,quote:neighbor.trim()}];}
      expect(targetFindings(data).length).toBeGreaterThan(0);
    }
  });
  test('wrong targets, conflicting attack facts, a second Attack and incomplete parents remain blocked',()=>{
    for(const change of ['target','type','bonus','reach','second','partial'] as const){const data=fixture();if(change==='target')data.feature.targetSpecial='任意目标';if(change==='type')data.feature.attack.type='rsak';if(change==='bonus')data.feature.attack.toHit=99;if(change==='reach')data.feature.attack.reach=50;
      if(change==='second'){data.source+='\n'+cases[0]!.source;data.feature.description+='\n'+cases[0]!.source;data.evidence.end=data.source.length;data.evidence.quote=data.source;data.ir.coverage[0]={...data.evidence,classification:'mechanical',claimPaths:['/creature/actions/0']};}
      if(change==='partial')data.feature.description=data.feature.description.split('。')[0]!+'。';
      expect(targetFindings(data).length).toBeGreaterThan(0);
    }
  });
  test('a missing target cannot promote the final range, bonus or attack-mode slot into a target',()=>{
    for(const [source,attack,target] of [
      ['Claw. Melee Weapon Attack: +5 to hit, reach 5 ft.',{type:'mwak',toHit:5,reach:5},'reach 5 ft'],
      ['Beam. Ranged Spell Attack: +6 to hit, range 120 ft.',{type:'rsak',toHit:6,range:120},'range 120 ft'],
      ['Claw. Melee Weapon Attack: +5 to hit.',{type:'mwak',toHit:5},'Melee Weapon Attack: +5 to hit'],
      ['爪击。近战武器攻击：命中+5，触及5尺。',{type:'mwak',toHit:5,reach:5},'触及5尺'],
    ] as const)expect(sourceAttackTargetClause(source,attack,target)).toBeUndefined();
    const data=fixture();data.source=data.source.replace('，单一目标','');data.feature.description=data.feature.description.replace('，单一目标','');data.feature.targetSpecial='触及5尺';data.evidence.quote=data.source;data.evidence.end=data.source.length;data.ir.coverage[0]={...data.evidence,classification:'mechanical',claimPaths:['/creature/actions/0']};expect(targetFindings(data).length).toBeGreaterThan(0);
  });
});
function offlineProvider(replies:string[],prompts:string[]=[],requests:any[]=[]){let calls=0;return new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline-test',baseUrl:'https://offline.invalid/v1',model:'test',reviewModel:'test',timeoutMs:10000,repairTimeoutMs:10000,maxAttempts:1,httpClient:async(_url,init)=>{const body=JSON.parse(init.body);prompts.push(body.messages[0].content);requests.push(body);if(calls>=replies.length)throw Error('No further recorded reply');return{ok:true,status:200,json:async()=>({choices:[{message:{content:replies[calls++]}}]})};}});}

describe('compact common-sentence damage evidence',()=>{
  test('the actual run6 reply binds both source-exact parts without changing the original reply',async()=>{
    const data=recorded.compactDamage,raw=JSON.parse(data.content),before=JSON.stringify(raw),ops=raw.facts.sourceOperations;
    expect(sourceOperationErrors(data.source,ops.map((op:any)=>({...op,sourceText:data.source.trim()})))).toContain('0/damage');
    const bound=bindSourceOperations(data.source,ops);expect(bound[0]!.proof.damage).toEqual([ops[0].proof.damage[0],ops[0].proof.damage[0]]);expect(bound[0]!.damage).toEqual(ops[0].damage);expect(JSON.stringify(raw)).toBe(before);
    const source=header+'Actions\n'+data.source,ir=await runStagedMonsterExtraction(request(source),async call=>{await call.onAttempt(1);if(call.stage==='source'){const lines=call.payload.lines as Array<{id:number;text:string}>,section=lines.findIndex(line=>line.text.trim()==='Actions');return{schemaVersion:1,units:[{firstLine:0,lastLine:section-1,destination:'base'},{firstLine:section,lastLine:section,destination:'context'},{firstLine:section+1,lastLine:lines.length-1,destination:'feature',section:'action',name:raw.facts.sourceOperations[0].name}]};}return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{...structuredClone(raw),unitId:call.unitId};},{baseMode:'facts',featureMode:'auto'});
    expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(markdown)) as any;
    expect(verifyMonsterIntake(source,ir,markdown,actor).findings.filter(finding=>finding.blocking)).toEqual([]);const attack=Object.values(actor.items[0].system.activities)[0] as any;expect(attack.damage.parts).toHaveLength(2);expect(attack.damage.includeBase).toBe(false);
  });
  test('compact evidence never supplies a missing other sentence, wrong formula, duplicate atom or conditional branch',()=>{
    const data=recorded.compactDamage,raw=JSON.parse(data.content).facts.sourceOperations;
    for(const mutate of [(ops:any[])=>{ops[0].damage[1].formula='8d12';},(ops:any[])=>{ops[0].damage[1]=structuredClone(ops[0].damage[0]);},(ops:any[])=>{ops[0].proof.damage[0]='7（2d6）光耀伤害。';},(ops:any[])=>{ops[0].damage[1].relationship='conditional';}]){const changed=structuredClone(raw);mutate(changed);expect(()=>bindSourceOperations(data.source,changed)).toThrow();}
    const separate=data.source.replace('穿刺伤害，外加','穿刺伤害。外加');expect(()=>bindSourceOperations(separate,raw)).toThrow();
    const source='Trial. DC 15 Dexterity saving throw. Failure: 2d6 fire damage, Success: 1d6 cold damage.',proof=sourceOperationClauses(source)[2]!,ops=[{id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:15,abilities:['dex'],choice:'single',outcome:'none'},damage:[{formula:'2d6',type:'fire',relationship:'base'},{formula:'1d6',type:'cold',relationship:'additional'}],proof:{save:sourceOperationClauses(source)[1],damage:[proof]}}];expect(()=>bindSourceOperations(source,ops)).toThrow();
  });
});

describe('core type aliases are independent of creature identity',()=>{
  test('the actual run7 static reply matches its unchanged short-form source header',()=>{const data=recorded.staticType;expect(()=>validateStagedStaticSourceFacts(data.source,JSON.parse(data.content).creature)).not.toThrow();});
  for(const [alias,type]of [['构装','construct'],['构装体','construct'],['构装生物','construct'],['天族','celestial'],['类人','humanoid']])test('an exact core header alias maps consistently: '+alias,()=>{const data=recorded.staticType,base=JSON.parse(data.content).creature;base.identity.creatureType=type;expect(()=>validateStagedStaticSourceFacts(data.source.replace('小型构装，','小型'+alias+'，'),base)).not.toThrow();});
  test('an unrelated or contradictory type is not accepted from a prefix or biography',()=>{const data=recorded.staticType,base=JSON.parse(data.content).creature;expect(()=>validateStagedStaticSourceFacts(data.source.replace('小型构装，','小型构装机械怪，'),base)).toThrow('UNSUPPORTED_STATIC_FACT');base.identity.creatureType='beast';expect(()=>validateStagedStaticSourceFacts(data.source,base)).toThrow('BASE_STATIC_CONFLICT');});
});

describe('ordinary source contracts use complete indexed claims',()=>{
  const source=recorded.ordinary.source;
  test('the actual initial ordinary reply binds the proven shared members and the source recharge title',async()=>{
    const raw=rawOrdinary();expect(raw.creature.actions[0].evidence).toBeUndefined();const ir=await offlineProvider([recorded.ordinary.content]).extract(request(source));
    expect(sourceResourcePoolErrors(source,ir.creature,hashSource(source))).toEqual([]);expect(ir.creature.actions.slice(0,2).every(feature=>feature.sourceFeatureId&&feature.evidence?.[0]?.quote.includes(feature.description))).toBe(true);
    expect(mixedFeatureSourceMatches(ir.creature.actions[2]!,'actions',ir.creature.identity.name)).toBe(true);
    const codes=validateMonsterIntakeIR(source,ir).blocking.map(finding=>finding.code);expect(codes).not.toContain('SOURCE_SHARED_RESOURCE_CONFLICT');expect(codes).not.toContain('MIXED_FEATURE_SOURCE_CONFLICT');expect(codes).toContain('SOURCE_BASIC_OPERATION_OMITTED');expect(codes).toContain('UNSUPPORTED_MECHANICAL_VALUE');
    expect(raw.creature.actions[0].evidence).toBeUndefined();expect(raw.creature.sourceResourcePools[0].id).toBeUndefined();
  });
  test('explicit wrong evidence/title/member IDs or conflicting counters remain uncorrected and blocking',()=>{
    for(const mutate of [(ir:any)=>{ir.creature.actions[0].evidence=structuredClone(ir.claims.find((claim:any)=>claim.path==='/creature/actions/1').evidence);},(ir:any)=>{ir.creature.actions[0].name='Another Pulse';},(ir:any)=>{ir.creature.actions[0].uses.max=4;},(ir:any)=>{ir.creature.actions[0].name='Force Pulse (4/Day)';},(ir:any)=>{ir.creature.sourceResourcePools[0].members[0].featureId='wrong';}]){
      const ir=rawOrdinary();mutate(ir);const explicit=structuredClone(ir.creature.actions[0].evidence);bindProviderSourceContracts(source,ir);expect(sourceResourcePoolErrors(source,ir.creature,hashSource(source)).length).toBeGreaterThan(0);if(explicit)expect(ir.creature.actions[0].evidence).toEqual(explicit);
    }
    const ir=rawOrdinary();delete ir.claims[ir.claims.findIndex((claim:any)=>claim.path==='/creature/actions/0')];bindProviderSourceContracts(source,ir);expect(ir.creature.sourceResourcePools[0].id).toBeUndefined();
    const outside=rawOrdinary();bindProviderSourceContracts(source,outside,{start:source.indexOf('Soul Mark (3/Day).'),end:source.length});expect(outside.creature.sourceResourcePools[0].id).toBeUndefined();
  });
  test('the real erroneous repair still cannot combine separate shared spell pools',async()=>{
    const prompts:string[]=[],provider=offlineProvider([recorded.ordinary.content,recorded.ordinary.repairContent],prompts);await provider.extract(request(source));const ir=structuredClone(recorded.ordinary.repairInputIr) as any,repaired=await provider.repair({stage:'deterministic-validation',source,ir,deterministicFindings:validateMonsterIntakeIR(source,ir).findings});
    expect(validateMonsterIntakeIR(source,repaired).blocking.map(finding=>finding.code)).toContain('MULTIPLE_SHARED_SPELL_POOLS');
    for(const prompt of prompts){expect(prompt).toContain('at most one daily-shared usageGroup per group');expect(prompt).toContain('The literal word Shared/each is not required');expect(prompt).toContain('On a sourceOperations feature, omit flat attack/save/damage');expect(prompt).toContain('No per-leaf claim proof or whitespace partition is requested');expect(prompt).not.toContain('EXAMPLE_IR_FRAGMENT_JSON:');}
  });
  test('the consolidated prompt declares independent pools without per-group ledgers or example partitions',async()=>{
    const prompts:string[]=[],provider=offlineProvider([recorded.ordinary.content],prompts);
    await provider.extract(request(source));const prompt=prompts[0]!;
    expect(prompt).toContain(FULL_IR_SOURCE_OPERATION_CONTRACT);
    expect(prompt).toContain('distinct shared pools need distinct groups/feature names');
    expect(prompt).toContain('at most one daily-shared usageGroup per group');
    expect(prompt).toContain('model the actual membership, count and recovery');
    expect(prompt).toContain('The literal word Shared/each is not required');
    expect(prompt).toContain('For a new default response, set claims:[] and coverage:[]');
    expect(prompt).toContain('No per-leaf claim proof or whitespace partition is requested');
    expect(prompt).not.toContain('EXAMPLE_SOURCE_JSON:');expect(prompt).not.toContain('EXAMPLE_IR_FRAGMENT_JSON:');
  });
});

/** Explicit test-authored repair, never a model success or modified artifact.
 * The three original independent spell groups are retained; missing claims,
 * operation projection and source-qualified keys are supplied from this source. */
function authoredCompleteOrdinary(){
  const ir=rawOrdinary();ir.creature.spellcasting.forEach((group:any,index:number)=>{if(index)group.featureName+=' ('+group.usageGroups[0].evidence[0].quote.split(':')[0]+')';ir.claims.push({path:'/creature/spellcasting/'+index,valueKind:'explicit',confidence:'high',evidence:structuredClone(group.evidence)});});
  ir.creature.actions.forEach((feature:any,index:number)=>{
    const clauses=sourceOperationClauses(feature.description);let ops:any[];
    if(index===0)ops=[{id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:16,abilities:['str'],choice:'single',outcome:'half'},damage:[{formula:'3d6',type:'force',relationship:'base'}],aoe:{shape:'cone',radius:15},proof:{save:clauses[1],damage:[clauses[2]],aoe:clauses[1]}}];
    else if(index===1)ops=[{id:'attack',name:'Attack',type:'attack',relationship:'primary',attack:{type:'msak',toHit:6,reach:5},damage:[{formula:'2d6',type:'necrotic',relationship:'base'}],proof:{attack:clauses[1],damage:[clauses[2]]}},{id:'save',name:'Follow-up Save',type:'save',relationship:'follow-up',save:{dc:14,abilities:['con'],choice:'single',outcome:'none'},proof:{save:clauses[3]}}];
    else if(index===2)ops=feature.sourceOperations;
    else ops=JSON.parse(recorded.ordinary.repairContent).operations.find((operation:any)=>operation.path==='/creature/actions/3').value.sourceOperations;
    for(const field of ['attack','save','damage','appliedConditions','aoe'])delete feature[field];feature.executionMode='native-with-gm';feature.activityType='utility';feature.sourceOperations=ops;
  });return ir;
}

test('ordinary flat attack+Save is blocked until both source operations reach a full Actor and shared consumption',async()=>{
  const source=recorded.ordinary.source,raw=rawOrdinary(),feature=raw.creature.actions[1];expect(sourceFeatureBasicOmissions(feature.description,feature)).toContain('save');
  const authored=authoredCompleteOrdinary(),ir=await offlineProvider([JSON.stringify(authored)]).extract(request(source));expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
  const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(markdown)) as any;expect(verifyMonsterIntake(source,ir,markdown,actor).findings.filter(finding=>finding.blocking)).toEqual([]);
  const wrongLanguage=structuredClone(actor);wrongLanguage.system.traits.languages.value=['abyssal','undercommon'];expect(verifyMonsterIntake(source,ir,markdown,wrongLanguage).findings).toContainEqual(expect.objectContaining({code:'ACTOR_LANGUAGE_DRIFT'}));
  const item=actor.items.find((item:any)=>item.name==='Soul Mark'),activities=Object.values(item.system.activities) as any[];expect(activities.map(activity=>activity.type)).toEqual(['attack','save']);expect(activities[1].save.dc.formula).toBe('14');expect(activities[1].activation.type).toBe('special');expect(activities[1].consumption.targets).toEqual([]);expect(activities[0].consumption.targets).toHaveLength(1);expect(item.effects).toEqual([]);
  const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;expect(manifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs)).toHaveLength(5);
  const forbidden=async():Promise<never>=>{throw Error('Offline source contract does not call models');};const result=await generateEncounterFromHumanMarkdown({source,label:'Test-authored complete ordinary source contract',reviewPolicy:'deferred',outputLanguage:'source',drafts:[{key:'actor-1',source,ir}],draftParentHash:hashSource(JSON.stringify(ir)),provider:{providerName:'offline',extractionModel:'saved',reviewModel:'saved',discover:forbidden,extract:forbidden,repair:forbidden,review:forbidden},automationProvider:{generate:forbidden,review:forbidden}});expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
});

test('only this source heading supplies missing short-name resource metadata',()=>{
  const rule='Copper Flare (Recharge 5-6). Each target takes 1 fire damage.';expect(sourceFeatureResources('Copper Flare',rule).recharge).toEqual([5,6]);expect(sourceFeatureResources('Another Flare',rule).recharge).toBeUndefined();expect(sourceFeatureResources('Copper Flare (Recharge 4-6)',rule).recharge).toEqual([4,6]);expect(sourceFeatureResources('Copper Flare','Copper Flare. The target regains 3 uses at dawn.').uses).toBeUndefined();
});

/** A proposed repair authored for this test only. It keeps the actual source,
 * corrects the demonstrably non-verbatim article and places ordinary failed
 * damage on its own Save. This is never claimed as a real model reply. */
function authoredSecondRepair(){
  const raw=JSON.parse(recorded.ordinarySecond.content.replaceAll('as its spellcasting ability','as the spellcasting ability'));
  for(const index of [0,2]){const operations=raw.creature.actions[index].sourceOperations;operations[0].damage=operations[1].damage;operations[0].proof.damage=operations[1].proof.damage;operations.splice(1,1);}
  const operations:any[]=[{op:'replace',path:'/creature/spellcasting',value:raw.creature.spellcasting},{op:'replace',path:'/creature/actions/0/sourceOperations',value:raw.creature.actions[0].sourceOperations},{op:'replace',path:'/creature/actions/2/sourceOperations',value:raw.creature.actions[2].sourceOperations}];
  for(const[index,claim]of raw.claims.entries())if(claim.path.startsWith('/creature/spellcasting/'))operations.push({op:'replace',path:'/claims/'+index+'/evidence',value:claim.evidence});
  for(const[index,coverage]of raw.coverage.entries())if(coverage.quote.includes('using Intelligence as the spellcasting ability'))operations.push({op:'replace',path:'/coverage/'+index+'/quote',value:coverage.quote});
  return{schemaVersion:1,operations};
}

describe('ordinary HTTP-success source errors reach the existing repair boundary',()=>{
  test('the actual ordinary2 reply remains invalid in strict binding and ordinary validator, with its original fields intact',async()=>{
    const data=recorded.ordinarySecond,raw=JSON.parse(data.content),feature=raw.creature.actions[0];expect(()=>bindSourceOperations(feature.description,feature.sourceOperations)).toThrow('result-branch-condition');
    const ir=await offlineProvider([data.content]).extract(request(data.source)),findings=validateMonsterIntakeIR(data.source,ir).blocking;
    expect(findings).toContainEqual(expect.objectContaining({code:'SOURCE_OPERATION_FACT_CONFLICT',path:'/creature/actions/0/sourceOperations/1/damage/0/result-branch-condition'}));expect(findings.some(finding=>finding.code==='EVIDENCE_MISMATCH')).toBe(true);
    expect(ir.creature.actions[0]!.sourceOperations![1]!.damage![0]!.relationship).toBe('base');expect(ir.creature.spellcasting![0]!.description).toContain('as its spellcasting ability');expect(data.content).toBe(recorded.ordinarySecond.content);
    const stagedSource=header+'Actions\n'+feature.description+'\n';await expect(runStagedMonsterExtraction(request(stagedSource),async call=>{await call.onAttempt(1);return call.stage==='base'?{schemaVersion:1,creature,uncertainties:[]}:{schemaVersion:1,unitId:call.unitId,mode:'native-with-gm',facts:{sourceOperations:structuredClone(feature.sourceOperations)}};},{baseMode:'facts',featureMode:'model'})).rejects.toThrow('FEATURE_FACT_CONFLICT');
  });
  test('public browser provider retains the AI result as a candidate with source warnings and permits one explicit repair',async()=>{
    const originalFetch=globalThis.fetch,replies=[recorded.ordinarySecond.content,JSON.stringify(authoredSecondRepair())],requests:any[]=[];
    try{
      globalThis.fetch=(async(_url:RequestInfo|URL,init?:RequestInit)=>{requests.push(JSON.parse(String(init?.body)));const content=replies[requests.length-1];if(content===undefined)throw Error('No extra requests allowed');return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content}}]}),{status:200,headers:{'Content-Type':'application/json'}});}) as unknown as typeof fetch;
      const source=recorded.ordinarySecond.source,input={source,sourceName:'Recorded ordinary source',requestId:'recorded-ordinary2',fvttVersion:'14.364',systemVersion:'5.3.3'},provider=createBrowserAiProvider({apiKey:'private-fixture-key',baseUrl:'https://offline.invalid/v1',model:'test',timeoutMs:10000,repairTimeoutMs:10000});
      const analysis=await analyzeBrowserActorSourceWithAi(input,provider);expect(analysis.status).toBe('needs_review');expect(analysis.ir).toBeDefined();expect(analysis.findings.some(finding=>finding.code==='SOURCE_OPERATION_FACT_CONFLICT')).toBe(true);expect(analysis.findings.some(finding=>/TRANSPORT|NETWORK/u.test(finding.code))).toBe(false);expect(requests).toHaveLength(1);
      const blocked=await generateBrowserActorIntakeCandidate(input,analysis,provider);expect(blocked.status).toBe('ready_for_gm_review');expect(blocked.candidateResponse).toBeDefined();expect(blocked.findings.some(finding=>finding.code==='SOURCE_OPERATION_FACT_CONFLICT')).toBe(true);expect(blocked.analysis.ir!.creature).toEqual(analysis.ir!.creature);expect(requests).toHaveLength(1);
      const forgedReady=await generateBrowserActorIntakeCandidate(input,{...analysis,status:'ready_to_generate'},provider);expect(forgedReady.status).toBe('ready_for_gm_review');expect(forgedReady.findings.some(finding=>finding.code==='SOURCE_OPERATION_FACT_CONFLICT')).toBe(true);expect(forgedReady.candidateResponse).toBeDefined();expect(requests).toHaveLength(1);
      const repaired=await repairBrowserActorIntake(input,analysis,provider);expect(repaired.status,JSON.stringify(repaired.findings)).toBe('ready_to_generate');expect(repaired.repairCount).toBe(1);expect(requests).toHaveLength(2);
      const generated=await generateBrowserActorIntakeCandidate(input,repaired,provider);expect(generated.status,JSON.stringify(generated.findings)).toBe('ready_for_gm_review');expect(generated.modelReviewStatus).toBe('not_requested');expect(requests).toHaveLength(2);
      const exhausted=await repairBrowserActorIntake(input,repaired,provider);expect(exhausted.findings.some(finding=>finding.code==='REPAIR_BUDGET_EXHAUSTED')).toBe(true);expect(requests).toHaveLength(2);
      const payload=JSON.parse(requests[1].messages.find((message:any)=>message.role==='user').content);expect(payload.deterministicFindings.some((finding:any)=>finding.path==='/creature/actions/0/sourceOperations/1/damage/0/result-branch-condition')).toBe(true);expect(payload.ir.creature.actions[0].sourceOperations[1].damage[0].relationship).toBe('base');
      expect(requests[0].messages[0].content).toContain('Example Save OP:');expect(requests[1].messages[0].content).toContain('Example Save OP:');
    }finally{globalThis.fetch=originalFetch;}
  });
  test('an unsafe post-HTTP binding shape is invalid_response without CORS, leaked values or another request',async()=>{
    const originalFetch=globalThis.fetch;let calls=0;const raw=JSON.parse(recorded.ordinarySecond.content);raw.creature.actions[0].sourceOperations[0].damage={formula:'private-model-value'};
    try{
      globalThis.fetch=(async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}),{status:200,headers:{'Content-Type':'application/json'}});}) as unknown as typeof fetch;
      const provider=createBrowserAiProvider({apiKey:'private-fixture-key',baseUrl:'https://offline.invalid/v1',model:'test',timeoutMs:10000,repairTimeoutMs:10000}),analysis=await analyzeBrowserActorSourceWithAi({source:recorded.ordinarySecond.source,sourceName:'Malformed binding fixture',requestId:'unsafe-binding-shape',fvttVersion:'14.364',systemVersion:'5.3.3'},provider);
      expect(analysis.status).toBe('failed');expect(analysis.errorCode).toBe('invalid_response');expect(analysis.findings[0]!.path).toBe('/creature');expect(analysis.findings[0]!.message).toContain('IR_BINDING_FAILED');expect(JSON.stringify(analysis.findings)).not.toMatch(/CORS|private-model-value|private-fixture-key/u);expect(calls).toBe(1);
    }finally{globalThis.fetch=originalFetch;}
  });
});

describe('ordinary operation carriers retain only one proven placement projection',()=>{
  const data=recorded.ordinaryThird;
  test('the actual ordinary3 replies fold only the two exact area mirrors; the unsupported automatic field remains blocking',async()=>{
    const raw=JSON.parse(data.content),before=JSON.stringify(raw),provider=offlineProvider([data.content,data.repairContent]),ir=await provider.extract(request(data.source));
    for(const index of [0,2]){expect(raw.creature.actions[index].aoe).toEqual(ir.creature.actions[index]!.sourceOperations![0]!.aoe);expect(ir.creature.actions[index]!.aoe).toBeUndefined();}
    expect(ir.creature.actions[1]!.appliedConditions).toEqual(raw.creature.actions[1].appliedConditions);
    for(const feature of ir.creature.actions)expect(sourceOperationErrors(feature.description,feature.sourceOperations)).toEqual([]);
    const findings=validateMonsterIntakeIR(data.source,ir).blocking;expect(findings.map(finding=>[finding.code,finding.path])).toEqual([
      ['SOURCE_OPERATION_CARRIER_CONFLICT','/creature/actions/1/appliedConditions'],['MIXED_FEATURE_SOURCE_CONFLICT','/creature/actions/1'],
    ]);expect(findings[0]!.message).toContain('Remove only appliedConditions');expect(findings[0]!.message).toContain('duration and timing');
    const repaired=await provider.repair({stage:'deterministic-validation',source:data.source,ir,deterministicFindings:findings});
    expect(validateMonsterIntakeIR(data.source,repaired).blocking.map(finding=>finding.path)).toEqual(['/creature/actions/1/appliedConditions','/creature/actions/1']);
    expect(JSON.stringify(raw)).toBe(before);
    const explicit=structuredClone(ir);delete explicit.creature.actions[1]!.appliedConditions;expect(validateMonsterIntakeIR(data.source,explicit).blocking).toEqual([]);
    const reordered=JSON.parse(data.content);reordered.creature.actions[0].aoe={radius:15,shape:'cone'};bindProviderSourceContracts(data.source,reordered);expect(reordered.creature.actions[0].aoe).toBeUndefined();
  });
  test('wrong values, flat rolls, timing, shortened parents and wrong OP evidence cannot be folded away',()=>{
    const cases:Array<(ir:any)=>void>=[
      ir=>{ir.creature.actions[0].aoe.radius=30;},
      ir=>{ir.creature.actions[0].aoe.condition='only if prone';},
      ir=>{ir.creature.actions[0].activationCondition='Only after an attack';},
      ir=>{ir.creature.actions[0].sourceContext=[];},
      ir=>{ir.creature.actions[0].sourceOperations[0].condition='Each creature';},
      ir=>{ir.creature.actions[0].sourceOperations[0].save.abilities=['dex'];},
      ir=>{ir.creature.actions[0].sourceOperations[0].proof.aoe=ir.creature.actions[2].sourceOperations[0].proof.aoe;},
      ir=>{const feature=ir.creature.actions[0];feature.sourceOperations[0].evidence={start:0,end:feature.description.trim().length,quote:feature.description.trim()};},
      ir=>{const feature=ir.creature.actions[0];feature.description=feature.description.split(' Force Pulse and')[0];},
    ];
    for(const mutate of cases){const ir=JSON.parse(data.content);mutate(ir);const area=structuredClone(ir.creature.actions[0].aoe);bindProviderSourceContracts(data.source,ir);expect(ir.creature.actions[0].aoe).toEqual(area);expect(validateMonsterIntakeIR(data.source,ir).blocking).toContainEqual(expect.objectContaining({code:'SOURCE_OPERATION_CARRIER_CONFLICT',path:'/creature/actions/0/aoe'}));}
    const flat=JSON.parse(data.content);flat.creature.actions[0].save={dc:16,ability:'str'};bindProviderSourceContracts(data.source,flat);expect(flat.creature.actions[0].save).toEqual({dc:16,ability:'str'});expect(validateMonsterIntakeIR(data.source,flat).blocking).toContainEqual(expect.objectContaining({code:'SOURCE_OPERATION_CARRIER_CONFLICT',path:'/creature/actions/0/save'}));
  });
  test('an explicit placement child claim and its coverage owner remain intact, including wrong or foreign evidence',()=>{
    for(const foreign of [false,true]){const ir=JSON.parse(data.content),path='/creature/actions/0/aoe',parent=ir.claims.find((claim:any)=>claim.path==='/creature/actions/'+(foreign?2:0));
      ir.claims.push({path,value:structuredClone(ir.creature.actions[0].aoe),valueKind:'explicit',confidence:'high',evidence:structuredClone(parent.evidence)});ir.coverage.find((entry:any)=>entry.claimPaths.includes('/creature/actions/0')).claimPaths.push(path);
      if(foreign)ir.claims.at(-1).evidence[0].quote+=' wrong';const claim=structuredClone(ir.claims.at(-1)),coverage=structuredClone(ir.coverage),area=structuredClone(ir.creature.actions[0].aoe);bindProviderSourceContracts(data.source,ir);
      expect(ir.creature.actions[0].aoe).toEqual(area);expect(ir.claims.find((entry:any)=>entry.path===path)).toEqual(claim);expect(ir.coverage.map((entry:any)=>({...entry,claimPaths:entry.claimPaths.filter((value:string)=>value!=='/creature/sourceResourcePools/0')}))).toEqual(coverage.map((entry:any)=>({...entry,claimPaths:entry.claimPaths.filter((value:string)=>value!=='/creature/sourceResourcePools/0')})));
      const findings=validateMonsterIntakeIR(data.source,ir).blocking;expect(findings).toContainEqual(expect.objectContaining({code:'SOURCE_OPERATION_CARRIER_CONFLICT',path}));if(foreign)expect(findings.some(finding=>finding.code==='EVIDENCE_MISMATCH')).toBe(true);
    }
  });
  function isolated(body:string,ops:any[],extra:Record<string,unknown>){const source='Actions\n'+body,ref={start:8,end:source.length,quote:body},feature={name:'Trial',description:body,activityType:'utility',sourceOperations:ops,...extra};return{source,ir:{schemaVersion:1,source:{sha256:hashSource(source),length:source.length},creature:{actions:[feature]},claims:[{path:'/creature/actions/0',valueKind:'explicit',confidence:'high',evidence:[ref]}],coverage:[{...ref,classification:'mechanical',claimPaths:['/creature/actions/0']}],uncertainties:[]} as any};}
  test('structurally equal range and target metadata fold only onto a unique source-proven primary owner',()=>{
    const body='Trial. Each creature within 20 feet must make a DC 15 Strength saving throw.',clause=sourceOperationClauses(body)[1]!,ops=[{id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:15,abilities:['str'],choice:'single',outcome:'none'},range:20,targetSpecial:'Each creature',proof:{save:clause,range:clause,target:clause}}],{source,ir}=isolated(body,ops,{range:20,targetSpecial:'Each creature'});
    bindProviderSourceContracts(source,ir);expect(sourceOperationErrors(body,ir.creature.actions[0].sourceOperations)).toEqual([]);expect(ir.creature.actions[0].range).toBeUndefined();expect(ir.creature.actions[0].targetSpecial).toBeUndefined();
  });
  test('two independently valid operations with the same area cannot choose a carrier owner by order',()=>{
    const body='Trial. Each creature in a 15-foot cone must make a DC 15 Strength saving throw. Then each creature in a 15-foot cone must make a DC 16 Dexterity saving throw.',clauses=sourceOperationClauses(body),ops=[15,16].map((dc,index)=>({id:'save-'+index,name:'Save',type:'save',relationship:index?'follow-up':'primary',save:{dc,abilities:[index?'dex':'str'],choice:'single',outcome:'none'},aoe:{shape:'cone',radius:15},proof:{save:clauses[index+1],aoe:clauses[index+1]}})),{source,ir}=isolated(body,ops,{aoe:{radius:15,shape:'cone'}});
    bindProviderSourceContracts(source,ir);expect(sourceOperationErrors(body,ir.creature.actions[0].sourceOperations)).toEqual([]);expect(ir.creature.actions[0].aoe).toEqual({radius:15,shape:'cone'});expect(mixedFeatureSourceMatches(ir.creature.actions[0])).toBe(false);
  });
  test('a source condition or timing before the primary proof is not erased by an absent OP.condition',()=>{
    for(const prefix of ['If the target is prone, ','At the start of its turn, ','如果目标倒地，','If the target is prone, use this rule. ']){
      const body='Trial. '+prefix+'Each creature within 20 feet must make a DC 15 Strength saving throw.',clause=sourceOperationClauses(body).at(-1)!,ops=[{id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:15,abilities:['str'],choice:'single',outcome:'none'},range:20,proof:{save:clause,range:clause}}],{source,ir}=isolated(body,ops,{range:20});
      bindProviderSourceContracts(source,ir);expect(sourceOperationErrors(body,ir.creature.actions[0].sourceOperations)).toEqual([]);expect(ir.creature.actions[0].range).toBe(20);expect(mixedFeatureSourceMatches(ir.creature.actions[0])).toBe(false);
    }
  });
  test('public analyze gives the exact legacy field to one targeted test-authored repair and retains the full GM consequence',async()=>{
    const originalFetch=globalThis.fetch,requests:any[]=[],replies=[data.content,JSON.stringify({schemaVersion:1,operations:[{op:'remove',path:'/creature/actions/1/appliedConditions'}]})];
    try{
      globalThis.fetch=(async(_url:RequestInfo|URL,init?:RequestInit)=>{requests.push(JSON.parse(String(init?.body)));const content=replies[requests.length-1];if(content===undefined)throw Error('No further fixture requests');return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});}) as unknown as typeof fetch;
      const input={source:data.source,sourceName:'Recorded ordinary3',requestId:'ordinary3-field-diagnostic',fvttVersion:'14.364',systemVersion:'5.3.3'},provider=createBrowserAiProvider({apiKey:'offline-test',baseUrl:'https://offline.invalid/v1',model:'test',timeoutMs:10000,repairTimeoutMs:10000});
      const analysis=await analyzeBrowserActorSourceWithAi(input,provider);expect(analysis.status).toBe('needs_review');expect(analysis.findings).toContainEqual(expect.objectContaining({code:'SOURCE_OPERATION_CARRIER_CONFLICT',path:'/creature/actions/1/appliedConditions'}));
      const blocked=await generateBrowserActorIntakeCandidate(input,{...analysis,status:'ready_to_generate'},provider);expect(blocked.status).toBe('ready_for_gm_review');expect(blocked.candidateResponse).toBeDefined();expect(blocked.findings).toContainEqual(expect.objectContaining({code:'SOURCE_OPERATION_CARRIER_CONFLICT',path:'/creature/actions/1/appliedConditions'}));
      const repaired=await repairBrowserActorIntake(input,analysis,provider);expect(repaired.status,JSON.stringify(repaired.findings)).toBe('ready_to_generate');expect(repaired.repairCount).toBe(1);
      const payload=JSON.parse(requests[1].messages.find((message:any)=>message.role==='user').content),field=payload.deterministicFindings.find((finding:any)=>finding.path==='/creature/actions/1/appliedConditions');expect(field.message).toContain('Remove only appliedConditions');expect(payload.ir.creature.actions[1].appliedConditions).toBeDefined();
      const generated=await generateBrowserActorIntakeCandidate(input,repaired,provider);expect(generated.status,JSON.stringify(generated.findings)).toBe('ready_for_gm_review');expect(requests).toHaveLength(2);
      const ir=repaired.ir!,markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(markdown)) as any;expect(verifyMonsterIntake(data.source,ir,markdown,actor).findings.filter(finding=>finding.blocking)).toEqual([]);
      expect(ir.creature.actions[1]!.description).toBe(analysis.ir!.creature.actions[1]!.description);expect(ir.creature.actions[2]!.sourceOperations![0]!.save).toMatchObject({abilities:['int','wis'],choice:'target',outcome:'half'});
      const mark=actor.items.find((item:any)=>item.name==='Soul Mark');expect(Object.values(mark.system.activities).map((activity:any)=>activity.type)).toEqual(['attack','save']);expect(mark.effects).toEqual([]);expect(mark.system.description.value).toContain('cannot regain hit points until the start of its next turn');
      for(const[index,radius]of [[0,15],[2,30]] as const){const item=actor.items.find((item:any)=>item.name===ir.creature.actions[index]!.name),activity=Object.values(item.system.activities)[0] as any;expect(activity.target.template.size).toBe(String(radius));}
      expect(requests[0].messages[0].content).toContain('never both');expect(requests[1].messages[0].content).toContain('omit ALL old flat executable fields');
    }finally{globalThis.fetch=originalFetch;}
  });
});

describe('repair comparisons use an independently owned reported source span',()=>{
  const data=recorded.ordinaryFourth,payload=(request:any)=>JSON.parse(request.messages.find((message:any)=>message.role==='user').content);
  const evidencePaths=[0,1].map(index=>'/creature/spellcasting/'+index+'/abilityEvidence/0');
  const quoteRepair=(source:string,ir:any)=>({schemaVersion:1,operations:evidencePaths.map((path,index)=>{const ref=ir.creature.spellcasting[index].abilityEvidence[0];return{op:'replace',path:path+'/quote',value:source.slice(ref.start,ref.end)};})});
  test('the actual ordinary4 reply receives exact quote-path comparisons, but its original repair and blocking evidence remain untouched',async()=>{
    const requests:any[]=[],provider=offlineProvider([data.content,data.repairContent],[],requests),ir=await provider.extract(request(data.source)),before=structuredClone(ir),findings=validateMonsterIntakeIR(data.source,ir).blocking;
    expect(findings.map(finding=>finding.code)).toEqual(['EVIDENCE_MISMATCH','SPELL_ABILITY_EVIDENCE_MISMATCH','EVIDENCE_MISMATCH','SPELL_ABILITY_EVIDENCE_MISMATCH']);
    const repaired=await provider.repair({stage:'deterministic-validation',source:data.source,ir,deterministicFindings:findings}),sent=payload(requests[1]);
    expect(sent.ir).toEqual(before);expect(ir).toEqual(before);expect(sent.deterministicFindings).toEqual(findings);
    expect(sent.diagnosticCandidates).toEqual(evidencePaths.map(path=>({findingPath:path,quotePath:path+'/quote',source:'request.source',start:441,end:487,quote:data.source.slice(441,487)})));
    expect(sent.diagnosticCandidates[0].quote).toBe('using Intelligence as the spellcasting ability');expect(sent.ir.creature.spellcasting[0].abilityEvidence[0].quote).toBe('using Intelligence as its spellcasting ability');
    const actualPatch=JSON.parse(data.repairContent);for(const[index,operation]of actualPatch.operations.entries())expect(repaired.creature.spellcasting![index]!.abilityEvidence).toEqual(operation.value);
    expect(validateMonsterIntakeIR(data.source,repaired).blocking.map(finding=>finding.code)).toEqual(findings.map(finding=>finding.code));
    expect(requests[1].messages[0].content).toContain('moving offsets or widening the range does not repair a changed character');expect(requests[1].messages[0].content).toContain('not an automatic patch');
  });
  test('the comparison handles either source wording and other early lexical changes without changing the original fuzzy-prefix rules',async()=>{
    const variants=[{source:data.source,quote:'using Intelligence as its spellcasting ability'},
      {source:data.source.replaceAll('as the spellcasting ability','as its spellcasting ability'),quote:'using Intelligence as the spellcasting ability'},
      {source:data.source,quote:'using Charisma as the spellcasting ability'}];
    for(const variant of variants){const raw=JSON.parse(data.content);raw.source.sha256=hashSource(variant.source);raw.creature.spellcasting.forEach((group:any)=>{group.description=group.description.replace('as the spellcasting ability',variant.source.includes('as its spellcasting ability')?'as its spellcasting ability':'as the spellcasting ability');group.evidence[0].quote=group.description;group.abilityEvidence[0].quote=variant.quote;});
      for(const claim of raw.claims)if(claim.path.startsWith('/creature/spellcasting/'))claim.evidence[0].quote=raw.creature.spellcasting[0].description;for(const entry of raw.coverage)if(entry.claimPaths.some((path:string)=>path.startsWith('/creature/spellcasting/')))entry.quote=raw.creature.spellcasting[0].description;
      const requests:any[]=[],provider=offlineProvider([JSON.stringify(raw),JSON.stringify({schemaVersion:1,operations:[]})],[],requests),ir=await provider.extract(request(variant.source)),findings=validateMonsterIntakeIR(variant.source,ir).blocking,before=structuredClone(ir);await provider.repair({stage:'deterministic-validation',source:variant.source,ir,deterministicFindings:findings});
      const sent=payload(requests[1]);expect(sent.diagnosticCandidates.map((entry:any)=>entry.quote)).toEqual([variant.source.slice(441,487),variant.source.slice(441,487)]);expect(sent.ir).toEqual(before);expect(ir).toEqual(before);
    }
  });
  test('invalid ranges, foreign ability spans, wrong source identity and unproven parents do not gain reported-range candidates',async()=>{
    const mutations:Array<(ir:any)=>void>=[
      ir=>{ir.creature.spellcasting.forEach((group:any)=>{group.abilityEvidence[0].start=-1;group.abilityEvidence[0].end=-1;});},
      ir=>{ir.creature.spellcasting.forEach((group:any)=>{group.abilityEvidence[0].start=441;group.abilityEvidence[0].end=data.source.length+1;});},
      ir=>{ir.creature.spellcasting.forEach((group:any)=>{group.abilityEvidence[0].start='441';});},
      ir=>{ir.creature.spellcasting.forEach((group:any)=>{group.abilityEvidence[0].start=0;group.abilityEvidence[0].end=46;});},
      ir=>{ir.creature.spellcasting.forEach((group:any)=>{const ref=ir.creature.actions[0].evidence[0];group.abilityEvidence[0].start=ref.start;group.abilityEvidence[0].end=ref.end;});},
      ir=>{ir.creature.spellcasting.forEach((group:any)=>{group.evidence=structuredClone(ir.creature.actions[0].evidence);});},
      ir=>{ir.source.sha256='wrong-source';},
    ];
    for(const mutate of mutations){const ir=await offlineProvider([data.content]).extract(request(data.source));mutate(ir);const requests:any[]=[],provider=offlineProvider([JSON.stringify({schemaVersion:1,operations:[]})],[],requests),before=structuredClone(ir),findings=validateMonsterIntakeIR(data.source,ir).blocking;expect(findings.length).toBeGreaterThan(0);await provider.repair({stage:'deterministic-validation',source:data.source,ir,deterministicFindings:findings});expect(payload(requests[0])).not.toHaveProperty('diagnosticCandidates');expect(ir).toEqual(before);}
  });
  test('the same source-parent rule supports OP evidence without accepting its original wrong quote',async()=>{
    const ir=await offlineProvider([data.content]).extract(request(data.source)),feature=ir.creature.actions[0]!,operation=feature.sourceOperations![0]!,path='/creature/actions/0/sourceOperations/0/evidence';operation.evidence!.quote=operation.evidence!.quote.replace('Each creature','Any creature');
    const requests:any[]=[],provider=offlineProvider([JSON.stringify({schemaVersion:1,operations:[]})],[],requests),finding={id:'op-evidence-quote',code:'EVIDENCE_MISMATCH',path,message:'Mismatch',blocking:true,origin:'evidence' as const,evidence:[operation.evidence!]};
    const repaired=await provider.repair({stage:'deterministic-validation',source:data.source,ir,deterministicFindings:[finding]});expect(payload(requests[0]).diagnosticCandidates).toEqual([{findingPath:path,quotePath:path+'/quote',source:'request.source',start:operation.evidence!.start,end:operation.evidence!.end,quote:data.source.slice(operation.evidence!.start,operation.evidence!.end)}]);expect(repaired.creature.actions[0]!.sourceOperations![0]!.evidence!.quote).toContain('Any creature');expect(validateMonsterIntakeIR(data.source,repaired).blocking).toContainEqual(expect.objectContaining({code:'SOURCE_OPERATION_FACT_CONFLICT',path:'/creature/actions/0/sourceOperations/0/evidence'}));
  });
  test('fixing only the quote cannot accept a contradictory declared casting ability',async()=>{
    const ir=await offlineProvider([data.content]).extract(request(data.source));ir.creature.spellcasting!.forEach(group=>{group.ability='wis';});const requests:any[]=[],provider=offlineProvider([JSON.stringify(quoteRepair(data.source,ir))],[],requests),findings=validateMonsterIntakeIR(data.source,ir).blocking,repaired=await provider.repair({stage:'deterministic-validation',source:data.source,ir,deterministicFindings:findings});
    expect(payload(requests[0]).diagnosticCandidates).toHaveLength(2);expect(repaired.creature.spellcasting!.map(group=>group.ability)).toEqual(['wis','wis']);expect(validateMonsterIntakeIR(data.source,repaired).blocking.map(finding=>finding.code)).toEqual(['SPELL_ABILITY_EVIDENCE_MISMATCH','SPELL_ABILITY_EVIDENCE_MISMATCH']);
  });
  test('a legal but clipped reported range provides comparison text, never proof that its boundaries support the field',async()=>{
    const ir=await offlineProvider([data.content]).extract(request(data.source));ir.creature.spellcasting!.forEach(group=>{group.abilityEvidence![0]!.start++;});
    const requests:any[]=[],provider=offlineProvider([JSON.stringify(quoteRepair(data.source,ir))],[],requests),findings=validateMonsterIntakeIR(data.source,ir).blocking,repaired=await provider.repair({stage:'deterministic-validation',source:data.source,ir,deterministicFindings:findings});
    expect(payload(requests[0]).diagnosticCandidates.map((candidate:any)=>candidate.quote)).toEqual([data.source.slice(442,487),data.source.slice(442,487)]);expect(repaired.creature.spellcasting![0]!.abilityEvidence![0]!.quote).toBe('sing Intelligence as the spellcasting ability');expect(validateMonsterIntakeIR(data.source,repaired).blocking.map(finding=>finding.code)).toEqual(['SPELL_ABILITY_EVIDENCE_MISMATCH','SPELL_ABILITY_EVIDENCE_MISMATCH']);
  });
  test('public analyze supplies exact quote paths to one explicitly test-authored repair; unchanged mechanics reach the full Actor',async()=>{
    const originalFetch=globalThis.fetch,requests:any[]=[],raw=JSON.parse(data.content),replies=[data.content,JSON.stringify(quoteRepair(data.source,raw))];
    try{
      globalThis.fetch=(async(_url:RequestInfo|URL,init?:RequestInit)=>{requests.push(JSON.parse(String(init?.body)));const content=replies[requests.length-1];if(content===undefined)throw Error('No extra fixture requests');return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]}),{status:200,headers:{'Content-Type':'application/json'}});}) as unknown as typeof fetch;
      const input={source:data.source,sourceName:'Recorded ordinary4',requestId:'ordinary4-quote-comparison',fvttVersion:'14.364',systemVersion:'5.3.3'},provider=createBrowserAiProvider({apiKey:'offline-test',baseUrl:'https://offline.invalid/v1',model:'test',timeoutMs:10000,repairTimeoutMs:10000}),analysis=await analyzeBrowserActorSourceWithAi(input,provider);
      expect(analysis.status).toBe('needs_review');expect(analysis.findings.map(finding=>finding.code)).toEqual(['EVIDENCE_MISMATCH','SPELL_ABILITY_EVIDENCE_MISMATCH','EVIDENCE_MISMATCH','SPELL_ABILITY_EVIDENCE_MISMATCH']);
      const blocked=await generateBrowserActorIntakeCandidate(input,{...analysis,status:'ready_to_generate'},provider);expect(blocked.status).toBe('ready_for_gm_review');expect(blocked.candidateResponse).toBeDefined();expect(blocked.intakeVerificationStatus).toBe('needs_review');expect(blocked.findings.some(finding=>finding.blocking)).toBe(true);
      const repaired=await repairBrowserActorIntake(input,analysis,provider);expect(repaired.status,JSON.stringify(repaired.findings)).toBe('ready_to_generate');expect(repaired.repairCount).toBe(1);expect(payload(requests[1]).diagnosticCandidates.map((entry:any)=>entry.quotePath)).toEqual(evidencePaths.map(path=>path+'/quote'));expect(payload(requests[1]).ir.creature.spellcasting[0].abilityEvidence[0].quote).toContain('as its');
      expect(repaired.ir!.creature.actions).toEqual(analysis.ir!.creature.actions);expect(repaired.ir!.creature.sourceResourcePools).toEqual(analysis.ir!.creature.sourceResourcePools);expect(repaired.ir!.creature.spellcasting!.flatMap(group=>group.usageGroups.flatMap(usage=>usage.spellRefs))).toHaveLength(5);
      const generated=await generateBrowserActorIntakeCandidate(input,repaired,provider);expect(generated.status,JSON.stringify(generated.findings)).toBe('ready_for_gm_review');expect(requests).toHaveLength(2);const exhausted=await repairBrowserActorIntake(input,repaired,provider);expect(exhausted.findings.some(finding=>finding.code==='REPAIR_BUDGET_EXHAUSTED')).toBe(true);expect(requests).toHaveLength(2);
      const ir=repaired.ir!,markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(markdown)) as any;expect(verifyMonsterIntake(data.source,ir,markdown,actor).findings.filter(finding=>finding.blocking)).toEqual([]);
    }finally{globalThis.fetch=originalFetch;}
  });
});

describe('complete parent component clauses reach every corresponding real Cast',()=>{
  const data=recorded.ordinaryFifth,allText='requiring no spell components';
  const plan=(rules:string)=>splitStagedMonsterSource(request(header+'Actions\n'+rules+'\n'));
  const staged=(rules:string)=>[...stagedSpellcastingGroups(plan(rules)).values()];
  const list=(name:string,clause:string)=>name+'. The creature casts the following spells '+clause+'; its spellcasting ability is Wisdom.\nAt will: Light, Mage Hand';
  const manifestFor=(ir:any,source:string)=>{const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(markdown)) as any;expect(verifyMonsterIntake(source,ir,markdown,actor).findings.filter(finding=>finding.blocking)).toEqual([]);return actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;};
  test('the actual formerly accepted ordinary5 IR is rejected at all five omitted restrictions; ordinary binding restores only missing parent facts',async()=>{
    const old:any=structuredClone(data.intakeIr),before=JSON.stringify(old),findings=validateMonsterIntakeIR(data.source,old).blocking;
    expect(findings.map(finding=>finding.code)).toEqual(Array(5).fill('SPELL_ALL_COMPONENT_WAIVER_MISSING'));expect(findings.map(finding=>finding.path)).toEqual(['/creature/spellcasting/0/usageGroups/0/spellRefs/0/restrictions','/creature/spellcasting/0/usageGroups/0/spellRefs/1/restrictions','/creature/spellcasting/0/usageGroups/1/spellRefs/0/restrictions','/creature/spellcasting/1/usageGroups/0/spellRefs/0/restrictions','/creature/spellcasting/1/usageGroups/0/spellRefs/1/restrictions']);expect(JSON.stringify(old)).toBe(before);
    const ir=await offlineProvider([data.content]).extract(request(data.source));expect(validateMonsterIntakeIR(data.source,ir).blocking).toEqual([]);expect(ir.creature.actions).toEqual(old.creature.actions);expect(ir.creature.sourceResourcePools).toEqual(old.creature.sourceResourcePools);
    const manifest=manifestFor(ir,data.source),refs=manifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs);expect(refs).toHaveLength(5);
    for(const group of manifest.spellcastingGroups)for(const ref of group.spellRefs){expect(ref.ignoresMaterialComponents).toBe(true);expect(ref.restrictions).toContainEqual({kind:'casting',text:allText,evidence:[{start:407,end:436,quote:allText}]});expect(buildCastActivitySource({manifestId:manifest.manifestId,featureId:'abcdefghijklmnop',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'}).activity.spell.properties).toEqual(['vocal','somatic','material']);}
    const stripped=structuredClone(ir.creature.spellcasting);stripped!.forEach(group=>group.usageGroups.forEach(usage=>usage.spellRefs.forEach(ref=>{ref.restrictions=[];})));expect(stripped).toEqual(old.creature.spellcasting);
  });
  test('the established normal3 staged all-component projection remains identical',()=>{
    const now=[...stagedSpellcastingGroups(splitStagedMonsterSource(request(data.source))).values()],projection=(groups:any[])=>groups.map(group=>({componentWaivers:group.componentWaivers,grants:group.usageGroups.map((usage:any)=>({usage:usage.usage,count:usage.count,refs:usage.spellRefs.map((ref:any)=>({name:ref.originalName,restrictions:ref.restrictions}))}))}));
    expect(projection(now)).toEqual(projection(data.stagedSpellcasting));
  });
  test('material-only sources retain only M, and an explicit all-component escalation remains blocking',async()=>{
    const source=header+'Actions\n'+list('Material Magic','without material components')+'\n',ir=await runStagedMonsterExtraction(request(source),async()=>({schemaVersion:1,creature,uncertainties:[]}),{baseMode:'facts',featureMode:'source'});expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
    const manifest=manifestFor(ir,source);for(const group of manifest.spellcastingGroups)for(const ref of group.spellRefs){expect(ref.restrictions).toEqual([]);expect(buildCastActivitySource({manifestId:manifest.manifestId,featureId:'abcdefghijklmnop',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'}).activity.spell.properties).toEqual(['material']);}
    ir.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.restrictions.push({kind:'casting',text:allText,evidence:ir.creature.spellcasting![0]!.componentWaivers[0]!.evidence});bindProviderSourceContracts(source,ir as any);expect(validateMonsterIntakeIR(source,ir).blocking.some(finding=>finding.code==='SPELL_ALL_COMPONENT_SCOPE_CONFLICT')).toBe(true);
  });
  for(const clause of [
    'without spell components for Light',
    'without spell components. Other spells require their normal components',
    'not normally requiring no spell components',
    'not normally\nrequiring no spell components',
    'without spell components only when hidden',
    'without spell components unless hidden',
    'quoting "without spell components"',
  ])test('a local, negated, conditional or unconsumed qualifier cannot become a group waiver: '+clause,()=>{
    const groups=staged(list('Conditional Magic',clause));expect(groups.flatMap(group=>group.usageGroups.flatMap(usage=>usage.spellRefs))).toEqual([]);expect(groups.some(group=>group.manualGrants?.length)).toBe(true);
  });
  test('a named spell waiver before a list does not waive other listed spells',()=>{
    const groups=staged('Local Magic. It casts light without spell components; other spells require their normal components. Its spellcasting ability is Wisdom.\nAt will: Light, Mage Hand');expect(groups.flatMap(group=>group.usageGroups)).toEqual([]);expect(groups[0]!.componentWaivers).toEqual([]);expect(groups[0]!.manualGrants![0]!.quote).toContain('other spells require their normal components');
  });
  test('a condition before the casting predicate cannot become an unconditional component override',()=>{
    for(const prefix of ['While its eyes are open, ','When hidden, ','只有当目标可见时，']){const groups=staged('Conditional Magic. '+prefix+'the creature casts the following spells without spell components; its spellcasting ability is Wisdom.\nAt will: Light, Mage Hand');expect(groups.flatMap(group=>group.usageGroups)).toEqual([]);expect(groups.flatMap(group=>group.componentWaivers)).toEqual([]);}
  });
  test('a manual grant after real grants does not supply a parent waiver or create another spell ref',()=>{
    const groups=staged('Mixed Magic. The creature casts the following spells; its spellcasting ability is Wisdom.\nAt will: Light\nUnknown grant: Mage Hand without spell components');expect(groups[0]!.usageGroups.flatMap(usage=>usage.spellRefs.map(ref=>ref.originalName))).toEqual(['Light']);expect(groups[0]!.componentWaivers).toEqual([]);expect(groups[0]!.usageGroups[0]!.spellRefs[0]!.restrictions).toEqual([]);expect(groups[0]!.manualGrants![0]!.quote).toContain('without spell components');
  });
  test('a separate group cannot borrow another parent component clause even when the words are identical',async()=>{
    const source=header+'Actions\n'+list('First Magic','without spell components')+'\n\n'+list('Second Magic','without spell components').replace('Second Magic.','**Second Magic.**').replace('At will: Light, Mage Hand','At will: Alarm, Blur')+'\n',ir=await runStagedMonsterExtraction(request(source),async()=>({schemaVersion:1,creature,uncertainties:[]}),{baseMode:'facts',featureMode:'source'});expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
    const groups=ir.creature.spellcasting!,bad=groups[1]!.usageGroups[0]!.spellRefs[0]!.restrictions[0]!;bad.evidence=structuredClone(groups[0]!.usageGroups[0]!.spellRefs[0]!.restrictions[0]!.evidence);const before=structuredClone(bad);bindProviderSourceContracts(source,ir as any);expect(bad).toEqual(before);expect(validateMonsterIntakeIR(source,ir).blocking).toContainEqual(expect.objectContaining({code:'SPELL_ALL_COMPONENT_SCOPE_CONFLICT',path:'/creature/spellcasting/1/usageGroups/0/spellRefs/0/restrictions/0'}));
  });
  test('ordinary explicit wrong restrictions or parent evidence are never overwritten to make the input pass',()=>{
    for(const mutate of [(ir:any)=>{ir.creature.spellcasting[0].usageGroups[0].spellRefs[0].restrictions=[{kind:'casting',text:allText,evidence:[{start:0,end:allText.length,quote:allText}]}];},(ir:any)=>{ir.creature.spellcasting[0].evidence=structuredClone(ir.creature.actions[0].evidence);}]){const ir:any=structuredClone(data.intakeIr);mutate(ir);const before=structuredClone(ir.creature.spellcasting[0].usageGroups[0].spellRefs[0].restrictions);bindProviderSourceContracts(data.source,ir);expect(ir.creature.spellcasting[0].usageGroups[0].spellRefs[0].restrictions).toEqual(before);expect(validateMonsterIntakeIR(data.source,ir).blocking.length).toBeGreaterThan(0);}
  });
  test('a header-only manual marker cannot cancel the component obligation of retained true spell grants',()=>{
    const ir:any=structuredClone(data.intakeIr);ir.creature.spellcasting.forEach((group:any)=>{group.componentWaivers=[];group.manualGrants=[{start:407,end:436,quote:allText}];});
    const findings=validateMonsterIntakeIR(data.source,ir).blocking;expect(findings.filter(finding=>finding.code==='SPELL_ALL_COMPONENT_WAIVER_MISSING')).toHaveLength(5);expect(findings.filter(finding=>finding.code==='SPELL_COMPONENT_WAIVER_MISSING')).toHaveLength(2);
    bindProviderSourceContracts(data.source,ir);expect(validateMonsterIntakeIR(data.source,ir).blocking).toEqual([]);expect(ir.creature.spellcasting.flatMap((group:any)=>group.usageGroups.flatMap((usage:any)=>usage.spellRefs))).toHaveLength(5);
    const manual:any=structuredClone(data.intakeIr);manual.creature.spellcasting.forEach((group:any)=>{group.usageGroups=[];group.componentWaivers=[];group.manualGrants=structuredClone(group.evidence);});bindProviderSourceContracts(data.source,manual);expect(manual.creature.spellcasting.flatMap((group:any)=>group.usageGroups)).toEqual([]);expect(manual.creature.spellcasting.flatMap((group:any)=>group.componentWaivers)).toEqual([]);
  });
  test('a wrapped shared preamble still applies to the subsequent native grants',async()=>{
    const source=header+'Actions\nWrapped Magic. The creature casts the following spells,\nrequiring no spell components and using Wisdom as its spellcasting ability.\nAt will: Light, Mage Hand\n',ir=await runStagedMonsterExtraction(request(source),async()=>({schemaVersion:1,creature,uncertainties:[]}),{baseMode:'facts',featureMode:'source'});expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);const refs=ir.creature.spellcasting!.flatMap(group=>group.usageGroups.flatMap(usage=>usage.spellRefs));expect(refs).toHaveLength(2);expect(refs.every(ref=>ref.restrictions.some(restriction=>restriction.kind==='casting'&&restriction.text===allText))).toBe(true);
  });
  test('a same-parent manual component sentence cannot replace the global component atom evidence',async()=>{
    const source=header+'Actions\nMixed Magic. The creature casts the following spells without spell components; its spellcasting ability is Wisdom.\nAt will: Light\nUnknown grant: Mage Hand without material components\n',ir=await runStagedMonsterExtraction(request(source),async()=>({schemaVersion:1,creature,uncertainties:[]}),{baseMode:'facts',featureMode:'source'});expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
    const quote='without material components',start=source.indexOf(quote),group=ir.creature.spellcasting![0]!;group.componentWaivers[0]!.evidence=[{start,end:start+quote.length,quote}];bindProviderSourceContracts(source,ir as any);expect(group.componentWaivers[0]!.evidence).toEqual([{start,end:start+quote.length,quote}]);expect(validateMonsterIntakeIR(source,ir).blocking).toContainEqual(expect.objectContaining({code:'SPELL_COMPONENT_SCOPE_CONFLICT',path:'/creature/spellcasting/0/componentWaivers/0'}));
  });
});
