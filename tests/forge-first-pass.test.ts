import {describe,test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {singleCreatureSourceCandidate} from '@fvtt-json-generator/intake-ai/discovery';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {projectActor} from '@fvtt-json-generator/intake-ai/verifier';
import {sourceCompletenessFindings} from '../packages/intake-ai/src/source-completeness';
import {analyzeBrowserActorSourceWithAi} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {normalizeMonsterSourceFacts} from '@fvtt-json-generator/intake-ai/source-facts';
import {anchorIrEvidence} from '@fvtt-json-generator/intake-ai/orchestrator';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {renderEncounterActorSource} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {generateEncounterFromHumanMarkdown,reviewForgeEncounterCandidate} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {LURKER_SOURCE,buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';
import {RAT_WARLOCK_SOURCE,buildRatWarlockIr} from '../src/core/intake/__tests__/fixtures/rat-warlock';

const block='# Example Creature\nExample Creature CR 2\nAC 14\nHP 45 (6d8 + 18)\nSpeed 30 ft.\nSTR 16 DEX 12 CON 16 INT 10 WIS 12 CHA 8\nActions\nClaw. Melee Attack: +5, reach 5 ft. Hit: 6 Slashing damage.\n';
describe('first-pass single-creature envelope',()=>{
  test('recognizes a complete raw statblock and retains trailing referenced rules',()=>{
    const source=block+'\n## Referenced definitions\n\nOld Oath\nA creature bound by this oath must reroll once per day.\n';
    const candidate=singleCreatureSourceCandidate(source)!;
    expect(candidate.label).toBe('Example Creature');
    expect(candidate).toMatchObject({start:0,end:source.length,quote:source});
  });
  test.each([
    '---\nname: "Different Archer"\narmor_class: "15"\nhit_points: "44 (8d8 + 8)"\nspeed: "30 ft."\nchallenge: "3"\nstr: 11\ndex: 16\ncon: 13\nint: 11\nwis: 14\ncha: 13\n---\n',
    '---\n名称: 小型精怪\n护甲等级: 14\n生命值: 31\n速度: 30尺\n挑战等级: 2\n力量: 12\n敏捷: 14\n体质: 15\n智力: 11\n感知: 14\n魅力: 4\n---\n',
  ])('recognizes a single bilingual/YAML envelope without narrowing the source',source=>{
    expect(singleCreatureSourceCandidate(source)?.quote).toBe(source);
  });
  test.each([block+block,block+'\n## Creature 2: Incomplete Ally\nNot a full statblock.',
    block+block.replace('AC 14','**Armor Class** 14').replace('HP 45','**Hit Points** 45'),
    block.replace('HP 45 (6d8 + 18)','A description without hit points.'),
    block.replace('STR 16 DEX 12 CON 16 INT 10 WIS 12 CHA 8','An incomplete ability list.')])('falls back for multiple/incomplete/ambiguous input',source=>{
    expect(singleCreatureSourceCandidate(source)).toBeUndefined();
  });
});

describe('first-pass source completeness',()=>{
  function reference(mode:'missing'|'preserved'|'ignored'){
    const body='A bound creature must reroll a d20 Test once per day, taking the second result.';
    const tail='\n\n## Referenced definitions from this document\n\nOld Oath\n'+body+'\n';
    const source=LURKER_SOURCE+tail, ir=buildValidLurkerIr();
    ir.source={sha256:createHash('sha256').update(source).digest('hex'),length:source.length};
    ir.coverage.push({start:LURKER_SOURCE.length,end:source.length,quote:tail,classification:mode==='ignored'?'ignored-with-reason':'narrative',claimPaths:[],reason:'background note'});
    if(mode==='preserved')ir.creature.biography=body;
    return {source,ir};
  }
  test.each(['missing','ignored'] as const)('rejects a reference hidden as %s before generation',mode=>{
    const {source,ir}=reference(mode);
    const findings=validateMonsterIntakeIR(source,ir).findings;
    const omitted=findings.find(f=>f.code==='SOURCE_DEFINITION_OMITTED')!;
    expect(omitted.blocking).toBe(true);
    expect(source.slice(omitted.evidence![0]!.start,omitted.evidence![0]!.end)).toBe(omitted.evidence![0]!.quote);
  });
  test('accepts a complete literal output landing and leaves unrelated source valid',()=>{
    const {source,ir}=reference('preserved');
    expect(sourceCompletenessFindings(source,ir)).toEqual([]);
    expect(validateMonsterIntakeIR(LURKER_SOURCE,buildValidLurkerIr()).blocking).toEqual([]);
  });
  test('handles a separate heading paragraph without dropping its first sentence',()=>{
    const {ir}=reference('missing');
    const source='## 引用定义\n\n旧誓约\n\n每个回合结束时再次进行豁免。成功则结束此效应。';
    expect(sourceCompletenessFindings(source,ir).some(f=>f.code==='SOURCE_DEFINITION_OMITTED')).toBe(true);
    ir.creature.biography='每个回合结束时再次进行豁免。成功则结束此效应。';
    expect(sourceCompletenessFindings(source,ir)).toEqual([]);
  });
  test('retains multi-paragraph exceptions and exact CRLF evidence offsets',()=>{
    const ir=buildValidLurkerIr();
    for(const newline of ['\n','\r\n']){
      const body='A bound creature must reroll a d20 Test once per day.';
      const exception='This does not apply while the creature is underwater.';
      const source=['## Referenced definitions','','Old Oath','',body,'',exception].join(newline);
      ir.creature.biography=body;
      const finding=sourceCompletenessFindings(source,ir).find(f=>f.code==='SOURCE_DEFINITION_OMITTED')!;
      expect(finding).toBeTruthy();
      const ref=finding.evidence![0]!;expect(source.slice(ref.start,ref.end)).toBe(ref.quote);
      ir.creature.biography=body+'\n\n'+exception;
      expect(sourceCompletenessFindings(source,ir)).toEqual([]);
    }
  });
  test('does not turn bold base attributes into missing abilities',()=>{
    expect(sourceCompletenessFindings('**Armor Class** 14\n**Hit Points** 45\n**Speed** 30ft.\n',buildValidLurkerIr())).toEqual([]);
  });
  test('does not turn wrapped sentence endings into abilities',()=>{
    expect(sourceCompletenessFindings('Actions\ndamage. Success: Half damage.\nnext turn. Failure by 5 or more: the target falls.',buildValidLurkerIr())).toEqual([]);
  });
  test('checks omitted abilities and explicit spell levels using source names only as correspondence',()=>{
    const ir=buildValidLurkerIr(),source='Actions\n***Echo Wave (Level 4 Spell).*** A wave hits a creature.\n';
    expect(sourceCompletenessFindings(source,ir).map(f=>f.code)).toEqual(['SOURCE_FEATURE_OMITTED']);
    const feature={...structuredClone(ir.creature.actions[0]!),name:'Echo Wave',englishName:'Echo Wave',description:'A wave hits a creature.'};
    ir.creature.actions.push(feature);
    expect(sourceCompletenessFindings(source,ir).map(f=>f.code)).toEqual(['SOURCE_SPELL_LEVEL_OMITTED']);
    feature.description='A wave hits a creature. This is a 4th-level spell.';
    expect(sourceCompletenessFindings(source,ir)).toEqual([]);
  });
  test('matches a Chinese title and English alias without a creature-specific lookup',()=>{
    const ir=buildValidLurkerIr();ir.creature.actions[0]!.name='回响';ir.creature.actions[0]!.englishName='Echo';
    expect(sourceCompletenessFindings('### 动作\n- **回响 (Echo)**：发出声音。',ir)).toEqual([]);
  });
});

test('preserves explicit reference bodies through real Forge analysis without another model call',async()=>{
  const body='A bound creature must reroll a d20 Test once per day, taking the second result.\n\nThis does not apply while the creature is underwater.';
  const tail='\n\n## Referenced definitions\n\nOld Oath\n'+body+'\n';
  const source=LURKER_SOURCE+tail, proposal=buildValidLurkerIr();
  proposal.source={sha256:createHash('sha256').update(source).digest('hex'),length:source.length};
  proposal.coverage.push({start:LURKER_SOURCE.length,end:source.length,quote:tail,classification:'ignored-with-reason',claimPaths:[],reason:'shared definition outside statblock'});
  const original=structuredClone(proposal);
  let extracted=0,reviewed=0;
  const provider={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
    discover:async()=>({schemaVersion:1 as const,candidates:[{id:'lurker',label:'Lurker',start:0,end:source.length,quote:source}]}),
    extract:async()=>{extracted++;return structuredClone(proposal);},
    repair:async()=>{throw new Error('Literal reference preservation must not require repair.');},
    review:async()=>{reviewed++;throw new Error('Paid review must remain opt-in.');}};
  expect(validateMonsterIntakeIR(source,proposal).blocking.some(f=>f.code==='SOURCE_DEFINITION_OMITTED')).toBe(true);
  const analysis=await analyzeBrowserActorSourceWithAi({source,sourceName:'Reference fixture',requestId:'reference-preservation',fvttVersion:'14.364',systemVersion:'5.3.3'},provider);
  expect(analysis.status).toBe('ready_to_generate');
  expect(analysis.validation?.blocking).toEqual([]);
  expect(renderMonsterIntakeMarkdown(analysis.ir!)).toContain('This does not apply while the creature is underwater.');
  expect(sourceCompletenessFindings(source,analysis.ir!)).toEqual([]);
  expect(analysis.ir!.creature.biography).toContain(body);
  expect(proposal).toEqual(original);
  expect(extracted).toBe(1);expect(reviewed).toBe(0);
});

describe('explicit definition source boundaries',()=>{
  function fixture(newline='\n',chinese=false){
    const title=chinese?'盐誓':'Salt Oath';
    const body=chinese?'每个回合结束时再次进行豁免。成功则结束此效应。\n\n如果目标在水下，则不能重复此豁免。'
      :'A bound creature must reroll a d20 Test once per day.\n\nThis does not apply while the creature is underwater.';
    const tail=('\n\n## '+(chinese?'引用定义':'Referenced definitions')+'\n\n'+title+'\n\n'+body+'\n').replaceAll('\n',newline);
    const source=LURKER_SOURCE+tail,ir=buildValidLurkerIr();
    ir.source={sha256:createHash('sha256').update(source).digest('hex'),length:source.length};
    ir.coverage.push({start:LURKER_SOURCE.length,end:source.length,quote:tail,classification:'narrative',claimPaths:[]});
    const scope={id:'reference-fixture',label:'Lurker',start:0,end:source.length,quote:source};
    return {source,ir,scope,title,body:body.replaceAll('\n',newline)};
  }
  test.each([['\n',false],['\r\n',false],['\n',true],['\r\n',true]] as const)('keeps complete literal text, exact evidence and idempotence for %s Chinese=%s',(newline,chinese)=>{
    const {source,ir,scope,body}=fixture(newline,chinese);
    const originalSections=structuredClone(ir.creature);
    normalizeMonsterSourceFacts(ir,source,scope);
    expect(ir.creature.biography).toContain(body);
    expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
    const claim=ir.claims.find(c=>c.valueKind==='preserved-literal'&&c.path==='/creature/biography')!;
    expect(claim.evidence).toHaveLength(1);
    for(const ref of claim.evidence)expect(source.slice(ref.start,ref.end)).toBe(ref.quote);
    const once=structuredClone(ir);normalizeMonsterSourceFacts(ir,source,scope);
    expect(ir).toEqual(once);
    for(const section of ['traits','actions','bonusActions','reactions','legendaryActions'] as const)expect(ir.creature[section]).toEqual(originalSections[section]);
    ir.creature.biography='';
    expect(validateMonsterIntakeIR(source,ir).blocking.some(f=>f.code==='SOURCE_DEFINITION_OMITTED')).toBe(true);
  });
  test('keeps an already complete feature landing and excludes another candidate’s definitions',()=>{
    const {source,ir,scope,body}=fixture();
    ir.creature.traits[0]!.description+='\n\n'+body;
    normalizeMonsterSourceFacts(ir,source,scope);
    expect(ir.creature.biography).toBeUndefined();
    expect(ir.claims.some(c=>c.valueKind==='preserved-literal'&&c.path==='/creature/biography')).toBe(false);
    const separate=fixture();
    normalizeMonsterSourceFacts(separate.ir,separate.source,{start:0,end:LURKER_SOURCE.length});
    expect(separate.ir.creature.biography).toBeUndefined();
    const clipped=fixture();
    const end=clipped.source.indexOf('This does not apply');
    normalizeMonsterSourceFacts(clipped.ir,clipped.source,{start:0,end});
    expect(clipped.ir.creature.biography).toBeUndefined();
    expect(sourceCompletenessFindings(clipped.source,clipped.ir,{start:0,end}).some(f=>f.code==='SOURCE_DEFINITION_OMITTED')).toBe(true);
  });
  test('does not silence unsupported mechanics, wrong identity, conflicting claims or malformed evidence',()=>{
    const {source,ir,scope}=fixture();
    ir.uncertainties.push({id:'manual-unknown',code:'UNSUPPORTED_MECHANIC',path:'/creature/actions/0',message:'GM must resolve this unsupported mechanism.',blocking:true,evidence:[ir.claims[0]!.evidence[0]!]});
    ir.source.sha256='0'.repeat(64);
    ir.claims.push({path:'/creature/biography',valueKind:'explicit',confidence:'high',value:'first',evidence:[ir.claims[0]!.evidence[0]!]},
      {path:'/creature/biography',valueKind:'explicit',confidence:'high',value:'second',evidence:[ir.claims[0]!.evidence[0]!]});
    normalizeMonsterSourceFacts(ir,source,scope);
    const codes=validateMonsterIntakeIR(source,ir).blocking.map(f=>f.code);
    expect(codes).toContain('UNSUPPORTED_MECHANIC');expect(codes).toContain('SOURCE_HASH_MISMATCH');expect(codes).toContain('CONFLICTING_CLAIMS');
    const malformed=fixture();
    malformed.ir.claims.push({path:'/creature/biography',valueKind:'explicit',confidence:'high',value:'',evidence:null as any});
    expect(()=>normalizeMonsterSourceFacts(malformed.ir,malformed.source,malformed.scope)).not.toThrow();
    expect(validateMonsterIntakeIR(malformed.source,malformed.ir).blocking.some(f=>f.code==='MISSING_EVIDENCE')).toBe(true);
  });
  test('retains the source chain through the shared CLI anchor and formal Actor generation',async()=>{
    const {source,ir,scope,title,body}=fixture();
    const anchored=anchorIrEvidence(source,scope,ir);
    expect(anchored.creature.biography).toContain(body);
    const markdown=renderMonsterIntakeMarkdown(anchored);
    const generated=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',translationService:null,iconOptions:{mode:'off'}});
    const report=verifyMonsterIntake(source,anchored,markdown,generated.rawJson,scope);
    expect(report.findings.filter(f=>f.blocking)).toEqual([]);
    const actor=generated.rawJson as any;
    expect(actor.system.details.biography.value).toContain(title);
    expect(actor.system.details.biography.value).toContain('This does not apply while the creature is underwater.');
  });
});

describe('literal qualified English aliases in GM carriers',()=>{
  test.each([
    ['Whisper','Whisper (Concentration)','Whisper (Concentration)'],
    ['Echo','Echo(Only if Bloodied)','Echo (Only if Bloodied)'],
    ['Lantern','LANTERN (Recharge 5-6)','LANTERN (Recharge 5-6)'],
  ])('retains %s qualified alias without nesting its own name',async(name,englishName,expectedName)=>{
    const ir=buildValidLurkerIr(),quote=`${englishName}. A GM resolves this exact source condition.`;
    ir.creature.actions.push({name:name!,englishName:englishName!,description:quote,activityType:'utility'});
    const rules=[{actorKey:'actor-1',featureName:name!,section:'action' as const,quote,gmSteps:['GM reads the complete rule.'],mechanicId:'qualified-literal',capabilityKind:'gm-manual' as const}];
    const markdown=renderEncounterActorSource(ir,rules);
    const result=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',translationService:null,iconOptions:{mode:'off'}});
    const item=(result.rawJson as any).items.find((i:any)=>i.name===expectedName);
    expect(item).toBeTruthy();expect(item.system.description.value).toContain(quote);
    expect(item.flags.fvttJsonGenerator.behaviorMechanics[0].executionMode).toBe('gm-assisted');
  });
  test('keeps an ordinary bilingual name and rejects an unrelated nested alias as a different identity',async()=>{
    const ir=buildValidLurkerIr(),quote='An exact manual source.';
    ir.creature.actions.push({name:'回声',englishName:'Echo',description:quote,activityType:'utility'});
    const rule={actorKey:'actor-1',featureName:'回声',section:'action' as const,quote,gmSteps:['GM reads this rule.'],mechanicId:'ordinary-bilingual',capabilityKind:'gm-manual' as const};
    const output=await convertMarkdownContentToJson({content:renderEncounterActorSource(ir,[rule]),fvttVersion:'14',effectProfile:'core',translationService:null,iconOptions:{mode:'off'}});
    expect((output.rawJson as any).items.some((i:any)=>i.name==='回声 (Echo)')).toBe(true);
    ir.creature.actions.at(-1)!.englishName='Different Echo (Concentration)';
    await expect(convertMarkdownContentToJson({content:renderEncounterActorSource(ir,[rule]),fvttVersion:'14',effectProfile:'core',translationService:null,iconOptions:{mode:'off'}})).rejects.toThrow('BehaviorProjection: expected exactly one Item');
  });
});

test('preserves existing skill totals for case variants emitted by extraction',()=>{
  const ir=buildValidLurkerIr();
  for(const key of ['acrobatics','Acrobatics','ACROBATICS']){
    ir.creature.skills={[key]:5};
    expect(renderMonsterIntakeMarkdown(ir)).toMatch(/特技: 5/u);
  }
});

test.each([[3,2],[7,3],[0.25,2]])('verifies derived NPC proficiency for CR %s when source JSON omits it',(cr,pb)=>{
  const actor={type:'npc',system:{details:{cr},abilities:{dex:{value:16,proficient:1}},skills:{acr:{ability:'dex',value:1}}}};
  const result=projectActor(actor,{skillKeys:['acrobatics'],saveKeys:['dex']}) as any;
  expect(result.proficiencyBonus).toBe(pb);expect(result.skills.acrobatics).toBe(3+pb);expect(result.saves.dex).toBe(3+pb);
  expect((projectActor({...actor,system:{...actor.system,attributes:{prof:4}}}) as any).proficiencyBonus).toBe(4);
});

test('fully native single Actor omits controller model calls and keeps GM review deferred',async()=>{
  let automation=0,review=0;
  const provider={providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
    discover:async()=>({schemaVersion:1 as const,candidates:[{id:'rat',label:'Rat Warlock',start:0,end:RAT_WARLOCK_SOURCE.length,quote:RAT_WARLOCK_SOURCE}]}),
    extract:async()=>buildRatWarlockIr(),repair:async(r:any)=>r.ir,
    review:async()=>{review++;return {schemaVersion:1 as const,verdict:'accepted' as const,findings:[]};}};
  const result=await generateEncounterFromHumanMarkdown({source:RAT_WARLOCK_SOURCE,label:'Native single',provider,reviewPolicy:'deferred',
    automationProvider:{generate:async()=>{automation++;throw new Error('Should not need controller.');},review:async()=>{review++;return {verdict:'accepted' as const,findings:[]};}}});
  expect(result.report.status).toBe('ready_for_gm_review');
  expect(result.report.generationRoute).toBe('single-actor-native');
  expect(result.prepared?.bundle.macros).toEqual([]);expect(automation).toBe(0);expect(review).toBe(0);
  const audited=await reviewForgeEncounterCandidate({source:RAT_WARLOCK_SOURCE,report:result.report,prepared:result.prepared!,provider,
    automationProvider:{generate:async()=>{throw new Error('No generation during review.');},review:async()=>{automation++;throw new Error('No empty controller review.');}}});
  expect(audited.report.status).toBe('ready_for_gm_review');expect(review).toBe(1);expect(automation).toBe(0);
});
