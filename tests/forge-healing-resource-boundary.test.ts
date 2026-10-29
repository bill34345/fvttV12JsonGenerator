import {describe,expect,test} from 'bun:test';
import {strict as assert} from 'node:assert';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {ActivityGenerator} from '../packages/generation/src/activity';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import type {ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {chain,collections,modelReply,ordinary,request,requireAcceptedChain} from './helpers/forge-semantic-chain';
import round3 from './fixtures/forge-iterate50-round3-cases.json';
import round5 from './fixtures/forge-iterate50-round5-cases.json';
import round11 from './fixtures/forge-iterate50-round11-cases.json';

const pendingTarget='GM：治疗目标未提供，请按完整原文确认对象、数量与范围。';
const aboleth='r14m-srd52-aboleth-psychic-drain',warCry='r14m-srd52-frost-giant-war-cry';
const legendaryCases=['r12m-srd52-kraken-toxic-ink','r12m-srd52-lich-deathly-teleport','r12m-srd52-sphinx-lore-weight-years'];
const replay=(c:any)=>{const ir=modelReply(c);for(const f of c.features)if(f.uses)ir.creature[collections[f.section]!].find((feature:any)=>feature.name===f.name).uses=structuredClone(f.uses);return ir;};
const feature=(c:any,ir:any)=>ir.creature[collections[c.features[0].section]!][0];
const healer=(actor:any)=>actor.items.flatMap((item:any)=>Object.values(item.system.activities)).find((activity:any)=>activity.type==='heal');
function moveHealingToOperation(c:any,ir:any){
  const carrier=feature(c,ir),healing=carrier.healing;delete carrier.healing;
  carrier.activityType='utility';carrier.executionMode='native-with-gm';carrier.nativeRuleText=carrier.manualRemainder=carrier.description;
  carrier.sourceOperations=[{id:'healing-event',name:carrier.name,type:'heal',relationship:'primary',healing,proof:{}}];
  return carrier;
}
function ledger(c:any){
  const context=c.units.find((unit:any)=>unit.destination==='context');assert.ok(context);
  const preamble=context.text.slice(context.text.indexOf('\n')+1).trim(),start=c.source.indexOf(preamble);assert.ok(start>=0);
  return{max:3,lairMax:4,recovery:'own-turn-start',preamble,evidence:[{start,end:start+preamble.length,quote:preamble}]};
}

describe('healing resource boundary',()=>{
  for(const id of [aboleth,warCry])test(`missing recipient remains a native Heal with an explicit GM boundary: ${id}`,async()=>{
    const c=structuredClone(round5.cases.find(row=>row.id===id));assert.ok(c);
    const originalFeature=c.features[0];assert.ok(originalFeature);
    const ir=replay(c),before=JSON.stringify(ir);expect(feature(c,ir).healing.target).toBeUndefined();
    const result=await chain(c,()=>ordinary(c,ir));requireAcceptedChain(result);
    expect(JSON.stringify(ir)).toBe(before);expect(feature(c,result.ir).healing.target).toBeUndefined();
    const heal=healer(result.actor);expect(heal).toBeDefined();
    expect(heal.target).toEqual({override:false,prompt:true,
      template:{count:'',contiguous:false,type:'',size:'',width:'',height:'',units:'ft'},
      affects:{count:'',type:'any',choice:false,special:pendingTarget}});
    expect(heal.range).toEqual({units:'spec',special:pendingTarget,override:false});
    expect(heal.healing).toMatchObject(id===aboleth?{number:1,denomination:10,types:['healing']}:{number:2,denomination:10,bonus:'5',types:['temphp']});
    const checked=verifyMonsterIntake(c.source,result.ir,result.markdown,result.actor,request(c.source).candidate);
    expect(checked.findings.filter(f=>f.code==='HEALING_TARGET_UNSPECIFIED')).toMatchObject([{blocking:false,path:expect.stringContaining('/healing/target')}]);
    expect(checked.findings.some(f=>f.code==='ACTOR_HEALING_TARGET_DRIFT')).toBe(false);
    const changed=structuredClone(result.actor),wrong=healer(changed);wrong.target.affects={count:'1',type:'self',choice:false,special:''};wrong.range={units:'self'};
    expect(verifyMonsterIntake(c.source,result.ir,result.markdown,changed,request(c.source).candidate).findings.some(f=>f.code==='ACTOR_HEALING_TARGET_DRIFT')).toBe(true);
    const plain=(text:string)=>text.replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim();
    expect(result.actor.items.some((item:any)=>plain(item.system.description.value).includes(plain(originalFeature.text)))).toBe(true);
  });

  for(const id of [aboleth,warCry])test(`the same missing recipient is retained on a source-operation carrier: ${id}`,async()=>{
    const c=structuredClone(round5.cases.find(row=>row.id===id));assert.ok(c);
    const ir=replay(c);moveHealingToOperation(c,ir);const before=JSON.stringify(ir);
    const result=await chain(c,()=>ordinary(c,ir));requireAcceptedChain(result);
    expect(JSON.stringify(ir)).toBe(before);
    const carrier=feature(c,result.ir),op=carrier.sourceOperations[0];
    expect(carrier.candidateReview.findings).toContainEqual({code:'HEALING_TARGET_UNSPECIFIED',path:'sourceOperations/0/healing/target',message:pendingTarget.slice(3)});
    expect(op.healing.target).toEqual({type:'any',special:pendingTarget});
    const heal=healer(result.actor);expect(heal.target.affects).toEqual({count:'',type:'any',choice:false,special:pendingTarget});
    expect(heal.range.units).toBe('spec');expect(heal.range.special).toContain('GM');expect(heal.range.value??'').toBe('');
    expect(result.actor.items.some((item:any)=>item.system.description.value.includes(pendingTarget))).toBe(true);
    const checked=verifyMonsterIntake(c.source,result.ir,result.markdown,result.actor,request(c.source).candidate);
    expect(checked.findings.filter(f=>f.code==='HEALING_TARGET_UNSPECIFIED')).toMatchObject([{blocking:false,path:expect.stringContaining('/sourceOperations/0/healing/target')}]);
  });

  for(const target of [{type:'any',special:''},{type:'self',count:1,special:'The aboleth'}])test(`an explicit source-operation ${target.type} recipient is not marked missing`,async()=>{
    const c=structuredClone(round5.cases.find(row=>row.id===aboleth));assert.ok(c);
    const ir=replay(c),carrier=moveHealingToOperation(c,ir);carrier.sourceOperations[0].healing.target=structuredClone(target);
    const result=await chain(c,()=>ordinary(c,ir));requireAcceptedChain(result);
    expect(feature(c,result.ir).sourceOperations[0].healing.target).toEqual(target);
    expect(verifyMonsterIntake(c.source,result.ir,result.markdown,result.actor,request(c.source).candidate).findings.some(f=>f.code==='HEALING_TARGET_UNSPECIFIED')).toBe(false);
  });

  for(const target of [undefined,{type:'any',special:''},{type:'self',count:1,special:'The aboleth'}])test(`mixed flat healing keeps the ${target?.type??'missing'} recipient beside an existing operation`,async()=>{
    const c=structuredClone(round5.cases.find(row=>row.id===aboleth));assert.ok(c);
    const damageText='It also deals 1 force damage.';
    c.features[0]!.text+=' '+damageText;
    for(const unit of c.units)if(unit.destination==='feature')unit.text=c.features[0]!.text+'\n';
    c.source=c.units.map(unit=>unit.text).join('');
    const ir=replay(c),carrier=feature(c,ir);
    if(target)carrier.healing.target=structuredClone(target);
    carrier.activityType='utility';carrier.executionMode='native-with-gm';carrier.nativeRuleText=carrier.manualRemainder=carrier.description;
    carrier.sourceOperations=[{id:'existing-damage',name:'Existing damage',type:'damage',relationship:'primary',sourceText:damageText,damage:[{formula:'1',type:'force',relationship:'base'}],proof:{damage:[damageText]}}];
    const noCall=async():Promise<never>=>{throw Error('Mixed healing boundary forbids model calls');};
    const provider={providerName:'fixed-mixed-boundary',extractionModel:'frozen',reviewModel:'disabled',discover:noCall,extract:noCall,review:noCall,repair:noCall};
    const input={source:c.source,sourceName:'mixed-healing',sourceScope:'single' as const,sourceId:'actor:v1:66d2fb85-4894-4fba-81e5-ac60b74f0170' as ForgeSourceId,requestId:'mixed-healing-'+(target?.type??'missing'),fvttVersion:'14.364',systemVersion:'5.3.3'};
    const analysis=analyzeBrowserActorIntakeDraft(input,structuredClone(ir),provider);
    const generated=await generateBrowserActorIntakeCandidate(input,analysis,provider);expect(generated.candidateAvailable).toBe(true);
    const actor=generated.actorProjection as any;expect(actor).toBeDefined();
    expect(actor.items.flatMap((item:any)=>Object.values(item.system.activities)).some((activity:any)=>activity.type==='damage'&&activity.damage.parts[0].types.includes('force'))).toBe(true);
    const heal=healer(actor);expect(heal).toBeDefined();
    expect(heal.target.affects).toEqual(target?{count:target.count===undefined?'':String(target.count),type:target.type,choice:false,special:target.special}
      :{count:'',type:'any',choice:false,special:pendingTarget});
    if(!target){
      expect(feature(c,analysis.ir).candidateReview.findings).toContainEqual({code:'HEALING_TARGET_UNSPECIFIED',path:'healing/target',message:pendingTarget.slice(3)});
      expect(generated.findings.some(f=>f.code==='HEALING_TARGET_UNSPECIFIED')).toBe(true);
      expect(heal.range.units).toBe('spec');expect(heal.range.special).toContain('GM');
    }else expect(generated.findings.some(f=>f.code==='HEALING_TARGET_UNSPECIFIED')).toBe(false);
    expect(generated.findings.some(f=>f.code==='ACTOR_HEALING_TARGET_DRIFT')).toBe(false);
  });

  for(const id of [aboleth,warCry,'r20r-periapt-of-health'])test(`explicit recipient keeps its complete target and healing: ${id}`,async()=>{
    const corpus=id.startsWith('r20r-')?round11:round5,c=structuredClone(corpus.cases.find(row=>row.id===id));assert.ok(c);
    const ir=replay(c),f=feature(c,ir);
    if(id===aboleth)f.healing.target={type:'self',count:1,special:'The aboleth'};
    if(id===warCry)f.healing.target={type:'creature',count:1,special:'The giant or one creature of its choice that can see or hear it'};
    const expected=structuredClone(f.healing.target),result=await chain(c,()=>ordinary(c,ir));requireAcceptedChain(result);
    expect(feature(c,result.ir).healing.target).toEqual(expected);
    const heal=healer(result.actor);expect(heal.target).toEqual({override:false,prompt:expected.type!=='self',
      template:{count:'',contiguous:false,type:'',size:'',width:'',height:'',units:'ft'},
      affects:{count:String(expected.count),type:expected.type,choice:false,special:expected.special}});
    if(expected.type==='creature')expect(heal.range).toEqual({units:'spec',special:expected.special,override:false});
    expect(verifyMonsterIntake(c.source,result.ir,result.markdown,result.actor,request(c.source).candidate).findings.some(f=>f.code==='HEALING_TARGET_UNSPECIFIED')).toBe(false);
    for(const mutate of [(value:any)=>{value.target.affects.type=expected.type==='self'?'creature':'self';},(value:any)=>{value.target.affects.count='2';},(value:any)=>{value.target.affects.special='Different eligibility';},(value:any)=>{value.healing.number=99;}]){
      const changed=structuredClone(result.actor);mutate(healer(changed));
      expect(verifyMonsterIntake(c.source,result.ir,result.markdown,changed,request(c.source).candidate).findings.some(f=>['ACTOR_HEALING_DRIFT','ACTOR_HEALING_TARGET_DRIFT'].includes(f.code))).toBe(true);
    }
  });

  test('explicit count and unqualified targets do not acquire an invented self-only default',()=>{
    const generator=new ActivityGenerator({fvttVersion:'14'});
    const targets:Array<{type:'self'|'creature'|'any';count?:number;special?:string}>=[{type:'creature',count:2,special:'two willing creatures'},{type:'any',special:''},{type:'self',count:1}];
    for(const target of targets){
      const activity:any=Object.values(generator.generate({name:'Declared heal',type:'heal',healing:{formula:'1d6',type:'healing',target}}))[0];
      expect(activity.target.affects).toEqual({count:target.count===undefined?'':String(target.count),type:target.type,choice:false,special:target.special??''});
    }
    const unrelated:any=Object.values(generator.generate({name:'Unrelated damage',type:'damage',damage:[{formula:'1d6',type:'fire'}]}))[0];
    expect(unrelated.healing).toBeUndefined();expect(unrelated.type).toBe('damage');
  });

  test('an omitted optional recipient note matches its blank projection without losing the declared target',async()=>{
    const c=structuredClone(round5.cases.find(row=>row.id===warCry));assert.ok(c);
    const ir=replay(c);feature(c,ir).healing.target={type:'creature',count:1};
    const result=await chain(c,()=>ordinary(c,ir));requireAcceptedChain(result);
    const declared=structuredClone(result.ir);delete feature(c,declared).healing.target.special;
    expect(healer(result.actor).target.affects).toEqual({count:'1',type:'creature',choice:false,special:''});
    expect(verifyMonsterIntake(c.source,declared,result.markdown,result.actor,request(c.source).candidate).findings.some(f=>f.code==='ACTOR_HEALING_TARGET_DRIFT')).toBe(false);
  });

  for(const id of legendaryCases)test(`missing legendary ledger is a nonblocking configuration issue: ${id}`,async()=>{
    const c=structuredClone(round3.cases.find(row=>row.id===id));assert.ok(c);
    const ir=replay(c),before=JSON.stringify(ir),result=await chain(c,()=>ordinary(c,ir));requireAcceptedChain(result);
    expect(JSON.stringify(ir)).toBe(before);expect(result.ir.creature.legendary).toBeUndefined();
    expect(result.actor.system.resources.legact).toEqual({max:0,spent:0});
    const acts:any[]=result.actor.items.flatMap((item:any)=>Object.values(item.system.activities));
    expect(acts.some(a=>a.activation.type==='legendary'&&a.activation.value===1)).toBe(true);
    expect(acts.every(a=>a.consumption.targets.length===0)).toBe(true);
    const checked=verifyMonsterIntake(c.source,result.ir,result.markdown,result.actor,request(c.source).candidate);
    expect(checked.findings.filter(f=>f.code==='LEGENDARY_BUDGET_UNSPECIFIED')).toMatchObject([{path:'/creature/legendary',blocking:false}]);
  });

  for(const id of legendaryCases)test(`explicit base and lair budgets survive the formal Actor: ${id}`,async()=>{
    const c=structuredClone(round3.cases.find(row=>row.id===id));assert.ok(c);
    const ir=replay(c);ir.creature.legendary=ledger(c);
    const result=await chain(c,()=>ordinary(c,ir));requireAcceptedChain(result);
    expect(result.ir.creature.legendary).toEqual(ir.creature.legendary);
    expect(result.actor.system.resources.legact).toEqual({max:3,spent:0});
    expect(result.actor.system.resources.lair).toMatchObject({value:true,inside:false});
    expect(result.actor.flags.fvttJsonGenerator.sourceLegendaryLedger).toMatchObject({max:3,lairMax:4,recovery:'own-turn-start'});
    expect(result.actor.items.flatMap((item:any)=>Object.values(item.system.activities)).every((activity:any)=>activity.consumption.targets.length===0)).toBe(true);
    expect(verifyMonsterIntake(c.source,result.ir,result.markdown,result.actor,request(c.source).candidate).findings.some(f=>f.code.startsWith('LEGENDARY_BUDGET_'))).toBe(false);
  });

  test('an explicit zero budget stays zero and remains distinct from missing and invalid values',async()=>{
    const c=structuredClone(round3.cases.find(row=>row.id===legendaryCases[0]));assert.ok(c);
    const ir=replay(c);ir.creature.legendary={max:0,preamble:'',evidence:[]};
    const checked=validateMonsterIntakeIR(c.source,ir);expect(checked.blocking).toEqual([]);
    expect(checked.warnings).toMatchObject([{code:'LEGENDARY_BUDGET_ZERO',path:'/creature/legendary/max',blocking:false}]);
    const result=await chain(c,()=>ordinary(c,ir));requireAcceptedChain(result);
    const retainedLegendary=result.ir.creature.legendary;assert.ok(retainedLegendary);
    expect(retainedLegendary.max).toBe(0);expect(result.actor.system.resources.legact).toEqual({max:0,spent:0});
    for(const max of [-1,0.5]){const invalid=structuredClone(ir);invalid.creature.legendary.max=max;expect(validateMonsterIntakeIR(c.source,invalid).blocking.some(f=>f.path==='/creature/legendary/max')).toBe(true);}
    const nonLegendary=structuredClone(ir);delete nonLegendary.creature.legendary;nonLegendary.creature.legendaryActions=[];
    expect(validateMonsterIntakeIR(c.source,nonLegendary).findings.some(f=>f.code.startsWith('LEGENDARY_BUDGET_'))).toBe(false);
  });

  test('zero base with one lair use retains its complete ledger through the formal Actor',async()=>{
    const c=structuredClone(round3.cases.find(row=>row.id===legendaryCases[0]));assert.ok(c);
    const ir=replay(c);ir.creature.legendary={...ledger(c),max:0,lairMax:1};
    expect(validateMonsterIntakeIR(c.source,ir).blocking).toEqual([]);
    const result=await chain(c,()=>ordinary(c,ir));requireAcceptedChain(result);
    expect(result.ir.creature.legendary).toEqual(ir.creature.legendary);
    expect(result.actor.system.resources.legact).toEqual({max:0,spent:0});
    expect(result.actor.system.resources.lair).toMatchObject({value:true,inside:false});
    expect(result.actor.flags.fvttJsonGenerator.sourceLegendaryLedger).toEqual({version:1,max:0,lairMax:1,recovery:'own-turn-start'});
    expect(result.actor.system.details.biography.value).toContain(ir.creature.legendary.preamble);
    expect(verifyMonsterIntake(c.source,result.ir,result.markdown,result.actor,request(c.source).candidate).findings.some(f=>f.code==='ACTOR_LEGENDARY_LAIR_DRIFT')).toBe(false);
    for(const ending of ['\n','\r\n'])expect(new YamlParser().parse(result.markdown.replace(/\r?\n/gu,ending)).sourceLegendaryLedger).toEqual({max:0,lairMax:1,recovery:'own-turn-start'});
    expect(result.markdown).toContain('lairMax: 1');
    for(const maximum of [0,-1,0.5])expect(new YamlParser().parse(result.markdown.replace('lairMax: 1','lairMax: '+maximum)).sourceLegendaryLedger).toBeUndefined();
  });
});
