import yaml from 'js-yaml';
import {completeSourceFeatureEvidence} from '../packages/intake-ai/src/source-completeness';
import {structuredActionToActivityData} from '../packages/generation/src/actor-item-builder';
import {strict as assert} from 'node:assert';
import {sourceOperationFeatureErrors,stagedFeatureMechanics,mixedFeatureSourceMatches,sourceFixedHealing} from '../packages/intake-ai/src/staged-feature-mechanics';
import {assembleStagedFeature} from '../packages/intake-ai/src/staged-extraction';
import {anchorIrEvidence} from '../packages/intake-ai/src/orchestrator';
import {renderMonsterIntakeMarkdown} from '../packages/intake-ai/src/renderer';
import {StructuredActionParser} from '../packages/parser/src/structuredAction';
import {ActivityGenerator} from '../packages/generation/src/activity';
import {describe,test,expect} from 'bun:test';
import {sourceSingleSpellAction,sourceHasSpellList,sourceCastingGrantPolarity} from '@fvtt-json-generator/models/source-rule-facts';
import {sourceFeatureResources,bindSourceOperations,sourceOperationClauses,materializeSourceOperationEvidence} from '@fvtt-json-generator/models/source-operations';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {sourceSectionHeading,splitStagedMonsterSource,stagedLegendaryLedger,assembleStagedLinePartition} from '../packages/intake-ai/src/staged-source';
import {modelReply,ordinary,staged,chain,collections,requireAcceptedChain,request} from './helpers/forge-semantic-chain';
import {newNeutralAttackContractVariant} from './helpers/neutral-source-contract';
import corpus from './fixtures/forge-broad-rule-research-cases.json';
import thirdCorpus from './fixtures/forge-fresh-third-rule-cases.json';
import fourthCorpus from './fixtures/forge-fresh-fourth-rule-cases.json';
import secondCorpus from './fixtures/forge-fresh-monster-rule-cases.json';
import fifthCorpus from './fixtures/forge-fresh-fifth-rule-cases.json';
import sixthCorpus from './fixtures/forge-fresh-sixth-rule-cases.json';
import seventhCorpus from './fixtures/forge-fresh-seventh-rule-cases.json';
import extraItemCorpus from './fixtures/forge-extra-item-rule-cases.json';
import iterate50Corpus from './fixtures/forge-iterate50-round1-cases.json';
import iterate50Round2 from './fixtures/forge-iterate50-round2-cases.json';
import iterate50Round3 from './fixtures/forge-iterate50-round3-cases.json';
import iterate50Round4 from './fixtures/forge-iterate50-round4-cases.json';
import iterate50Round5 from './fixtures/forge-iterate50-round5-cases.json';
import iterate50Round6 from './fixtures/forge-iterate50-round6-cases.json';
import iterate50Round7 from './fixtures/forge-iterate50-round7-cases.json';
import iterate50Round8 from './fixtures/forge-iterate50-round8-cases.json';
import iterate50Round9 from './fixtures/forge-iterate50-round9-cases.json';
import iterate50Round10 from './fixtures/forge-iterate50-round10-cases.json';
import iterate50Round11 from './fixtures/forge-iterate50-round11-cases.json';
import {stagedSpellcastingGroups} from '../packages/intake-ai/src/staged-spellcasting';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
const get=(id:string):any=>structuredClone(corpus.cases.find(c=>c.id===id));
const raw=(c:any)=>{const ir=modelReply(c);for(const f of c.features)if(f.uses)ir.creature[collections[f.section]!].find((x:any)=>x.name===f.name).uses=f.uses;return ir;};
const normalize=(s:string)=>s.replace(/<[^>]+>/gu,' ').replace(/&#39;|&apos;/gu,"'").replace(/&amp;/gu,'&').replace(/&quot;/gu,'"').replace(/\s+/gu,' ').trim();
test('a separately appearing caster does not give its spells to the item carrier',async()=>{
 const c:any=structuredClone(extraItemCorpus.cases.find(c=>c.id==='r9r-efreeti-bottle'));
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);expect(r.ir.creature.spellcasting).toBeUndefined();expect(r.actor.items).toHaveLength(1);expect(Object.values(r.actor.items[0].system.activities).map((a:any)=>a.type)).toEqual(['utility']);expect(normalize(r.actor.items[0].system.description.value)).toContain(normalize(c.features[0].text));
 }
});
for(const [intro,subject]of [['An efreeti appears in an unoccupied space.','The efreeti'],['A fire spirit emerges from the bottle.','The fire spirit'],['Another guardian is summoned beside you.','The guardian']])test('introduced external caster ownership: '+subject,()=>{
 const single=`Bottle. ${intro} ${subject} can also cast wish.`,list=`Bottle. ${intro} ${subject} casts the following spells. At will: wish.`;
 expect(sourceSingleSpellAction(single)).toBeUndefined();expect(sourceHasSpellList(list)).toBe(false);expect(sourceCastingGrantPolarity(single)).toBe('external');expect(sourceCastingGrantPolarity(list)).toBe('external');
 const own=`Bottle. ${intro} The sentinel can also cast web.`;expect(sourceSingleSpellAction(own)?.name).toBe('web');expect(sourceCastingGrantPolarity(own)).toBe('positive');
 expect(sourceHasSpellList(`Bottle. ${intro} Sentinel casts the following spells. At will: web.`)).toBe(true);
});
test('an ordinary spellcaster profile without an introduced entity remains positive',()=>{
 const source='Spellcasting. The spellcaster casts the following spells. At will: web.';
 expect(sourceHasSpellList(source)).toBe(true);expect(sourceCastingGrantPolarity(source)).toBe('positive');
});
test('an earlier foreign or negative list cannot hide a later genuine own list',async()=>{
 for(const intro of ['An efreeti appears. The efreeti casts the following spells: wish.','Sentinel cannot cast the following spells: wish.']){
  const c=get('hydra-head-count-state'),f=c.features[0];f.name='Mixed Magic';f.text=`Mixed Magic. ${intro} Sentinel casts the following spells: shield.`;f.operations=[];
  for(const u of c.units)if(u.destination==='feature'){u.name=f.name;u.text=f.text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');
  for(const path of ['ordinary','staged']){
   const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));expect(r.status).toBe('blocked');if(path==='ordinary')expect(r.findings?.some(f=>f.code==='SPELLCASTING_NOT_STRUCTURED')).toBe(true);
  }
  expect(sourceHasSpellList(f.text)).toBe(true);
 }
});
test('wrapped legendary preamble prose cannot demand a nonexistent Actions section',async()=>{
 const c:any=structuredClone(seventhCorpus.cases.find(c=>c.id==='r7-lich-cantrip'));
 expect(c.source).toContain('spent legendary\nactions at the start');
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
  expect(r.actor.items).toHaveLength(1);expect(r.actor.items[0].name).toBe('Cantrip');expect(Object.values(r.actor.items[0].system.activities).map((a:any)=>a.type)).toEqual(['utility']);expect(r.ir.creature.actions).toEqual([]);
 }
});
for(const line of ['actions at the start of its turn.','Bonus Actions or Reactions.','Reactions during that turn.','Traits that change in the new form.','Legendary Actions are regained.','Mythic Actions cannot be used.'])test('a section label within prose is not a complete heading: '+line,()=>{
 expect(sourceSectionHeading(line)).toBeUndefined();
});
for(const heading of ['Actions','## **Actions**','###### 动作 Actions','__动作：__'])test('a genuine missing Actions section remains blocked: '+heading,()=>{
 const c:any=structuredClone(seventhCorpus.cases.find(c=>c.id==='r7-marilith-multiattack'));
 c.units[1].text=heading+'\n';c.source=c.units.map((u:any)=>u.text).join('');const ir=raw(c);ir.creature.actions=[];
 expect(validateMonsterIntakeIR(c.source,ir).blocking.some(f=>f.code==='MISSING_SOURCE_FEATURES'&&f.path==='/creature/actions')).toBe(true);
});
test('the legacy singular Reaction heading retains its complete feature and omission guard',async()=>{
 const c:any=structuredClone(thirdCorpus.cases.find(c=>c.id==='r3-shield-guardian-shield'));
 const context=c.units.find((u:any)=>u.destination==='context');context.text=context.text.replace('Reactions','Reaction');c.source=c.units.map((u:any)=>u.text).join('');expect(sourceSectionHeading('Reaction')).toBe('reaction');
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);expect(r.actor.items).toHaveLength(1);expect((Object.values(r.actor.items[0].system.activities)as any[])[0].activation.type).toBe('reaction');
 }
 const ir=raw(c);ir.creature.reactions=[];expect(validateMonsterIntakeIR(c.source,ir).blocking.some(f=>f.code==='MISSING_SOURCE_FEATURES'&&f.path==='/creature/reactions')).toBe(true);
});
test('a consequence verb cannot supply a second saving-throw ability',async()=>{
 const c:any=structuredClone(sixthCorpus.cases.find(c=>c.id==='r6-diseased-giant-rat-bite'));
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
  const acts=Object.values(r.actor.items[0].system.activities)as any[];expect(acts.map(a=>a.type)).toEqual(['attack','save']);expect(acts[1].save.ability).toEqual(['con']);expect(acts[1].save.dc.formula).toBe('10');expect(r.actor.items[0].effects).toEqual([]);
  const changed=structuredClone(c);changed.features[0].operations[1].save.abilities=['con','con'];changed.features[0].operations[1].save.choice='target';
  expect((await chain(changed,()=>path==='ordinary'?ordinary(changed,raw(changed)):staged(changed))).status).toBe('blocked');
 }
});
for(const ending of ['or contract a disease','or concentrate on nothing','or interpret the warning','and strengthen the barrier'])test('ability tokens have whole-word boundaries: '+ending,()=>{
 const source=`Warning. A target must succeed on a DC 12 Wisdom saving throw ${ending}.`;
 const ops=[{id:'save',name:'Save',type:'save',relationship:'primary',save:{dc:12,abilities:['wis'],choice:'single',outcome:'none'},proof:{save:source.slice(9)}}];
 expect(()=>bindSourceOperations(source,ops)).not.toThrow();
});
test('form damage remains two exclusive attacks instead of a two-handed property',async()=>{
 const c:any=structuredClone(sixthCorpus.cases.find(c=>c.id==='r6-oni-glaive'));
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
  const item=r.actor.items[0],acts=Object.values(item.system.activities)as any[];
  expect(item.type).toBe('feat');expect(item.system.properties??[]).not.toContain('ver');expect(acts.map(a=>a.type)).toEqual(['attack','attack']);
  expect(acts.map(a=>a.attack.bonus)).toEqual(['7','7']);expect(acts.map(a=>a.damage.parts.map((p:any)=>[p.number,p.denomination,p.bonus,p.types]))).toEqual([[[2,10,'4',['slashing']]],[[1,10,'4',['slashing']]]]);
 }
});
test('passive rescue damage targets the rescuer without consuming the cube action',async()=>{
 const c:any=structuredClone(sixthCorpus.cases.find(c=>c.id==='r6-gelatinous-cube-ooze-cube'));
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
  const acts=Object.values(r.actor.items[0].system.activities)as any[];expect(acts.map(a=>a.type)).toEqual(['damage']);expect(acts[0].target.affects.special).toBe('the creature making the attempt');expect(acts[0].activation.type).toBe('');expect(acts[0].consumption.targets).toEqual([]);expect(acts[0].activation.condition).toContain('can take an action');expect(acts[0].activation.condition).toContain('DC 12 Strength check');
 }
});
test('Enlarge and Invisibility keep independent resources on the same Actor',async()=>{
 const first:any=structuredClone(sixthCorpus.cases.find(c=>c.id==='r6-duergar-enlarge')),second:any=structuredClone(sixthCorpus.cases.find(c=>c.id==='r6-duergar-invisibility'));
 first.features.push(second.features[0]);first.units.push(second.units.find((u:any)=>u.destination==='feature'));first.source=first.units.map((u:any)=>u.text).join('');
 for(const path of ['ordinary','staged']){
  const r=await chain(first,()=>path==='ordinary'?ordinary(first,raw(first)):staged(first));requireAcceptedChain(r);expect(r.actor.items).toHaveLength(2);
  expect(new Set(r.actor.items.map((i:any)=>i.name)).size).toBe(2);
  for(const item of r.actor.items){expect(item.system.uses).toEqual({spent:0,max:'1',recovery:[{period:'sr',type:'recoverAll'}]});
   const acts=Object.values(item.system.activities)as any[];expect(acts.map(a=>a.type)).toEqual(['utility']);
   if(path==='staged')expect(acts[0].consumption.targets).toEqual([{type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}}]);
   else expect(acts[0].consumption).toBeUndefined();
  }
 }
});
describe('source-owned manual counters',()=>{
 for(const id of ['engulf-mixed-capacity','hydra-head-count-state','hydra-opportunity-only-reactions'])test(id+' rejects invented daily uses and final counter drift',async()=>{
  const c=get(id),control=await chain(c,()=>ordinary(c,raw(c)));requireAcceptedChain(control);
  const proposal=raw(c);proposal.creature.traits[0].uses={max:6,period:'day'};
  expect(validateMonsterIntakeIR(c.source,proposal).blocking.some(f=>f.code==='MANUAL_RESOURCE_SOURCE_CONFLICT')).toBe(true);
  const altered=structuredClone(control.actor);altered.items[0].system.uses={spent:0,max:'6',recovery:[{period:'day',type:'recoverAll'}]};
  expect(verifyMonsterIntake(c.source,control.ir,control.markdown,altered).findings.some(f=>f.blocking&&f.code==='ACTOR_MANUAL_RESOURCE_DRIFT')).toBe(true);
 });
 test('a declared leading daily frequency and short-rest recovery remain available',async()=>{
  for(const id of ['night-hag-duration-plane-protection','chain-devil-controlled-object-actions']){
   const c=get(id);for(const path of ['ordinary','staged']){
    const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
    const f=c.features[0],item=r.actor.items.find((i:any)=>i.name===f.name);
    expect(item.system.uses.max).toBe('1');expect(item.system.uses.recovery).toEqual([{period:f.uses.period==='day'?'day':'sr',type:'recoverAll'}]);
   }
  }
 });
 test('capacity and a target-owned leading allowance do not prove a counter',()=>{
  expect(sourceFeatureResources('Capacity','Capacity. Sentinel can have six tendrils at a time.')).toEqual({});
  expect(sourceFeatureResources('Invitation','Invitation. Once per day, the target may ask for help.')).toEqual({});
  expect(sourceFeatureResources('Invitation','Invitation. Once per day, one creature touching Sentinel can ask for help.','Sentinel')).toEqual({});
  expect(sourceFeatureResources('Invitation','Invitation. The target can use this blessing 3 times per day.','Sentinel')).toEqual({});
  expect(sourceFeatureResources('Invitation','Invitation. Sentinel can use this blessing 3 times per day.','Sentinel')).toEqual({uses:{max:3,period:'day'}});
  expect(sourceFeatureResources('Invitation','Invitation. Once per day, Sentinel can ask for help.','Sentinel')).toEqual({uses:{max:1,period:'day'}});
  expect(sourceFeatureResources('Invitation','Invitation. Sentinel can use this blessing 3 times. The target regains all uses after a short rest.','Sentinel')).toEqual({});
 });
 for(const[body,max]of [['Once per day, one creature touching Sentinel can ask for help.',1],['The target can use this blessing 3 times per day.',3],['Sentinel can use an action to let the target use this blessing 3 times per day.',3],['Sentinel can use this action to let the target use this blessing 3 times per day.',3]]as const)test('another actor allowance never becomes an Item counter: '+body,async()=>{
  const c=get('engulf-mixed-capacity'),f=c.features[0];f.text=f.name+'. '+body;for(const u of c.units)if(u.destination==='feature')u.text=f.text+'\n';c.source=c.units.map((u:any)=>u.text).join('');
  const good=await chain(c,()=>ordinary(c,raw(c)));requireAcceptedChain(good);
  const bad=raw(c);bad.creature.traits[0].uses={max,period:'day'};
  const r=await chain(c,()=>ordinary(c,bad));expect(r.status).toBe('blocked');expect(r.findings?.some(f=>f.code==='MANUAL_RESOURCE_SOURCE_CONFLICT')).toBe(true);
 });
 test('malformed manual names still produce findings instead of throwing',()=>{
  const c=get('hydra-head-count-state'),proposal=raw(c);proposal.creature.traits[0].name=null;
  expect(()=>validateMonsterIntakeIR(c.source,proposal)).not.toThrow();expect(validateMonsterIntakeIR(c.source,proposal).blocking.length).toBeGreaterThan(0);
 });
});
describe('base facts retain their source owner',()=>{
 for(const id of ['roper-independent-appendage-hp','chain-devil-controlled-object-actions'])test(id+' accepts separate object AC but rejects using it as the Actor AC',async()=>{
  const c=get(id);for(const path of ['ordinary','staged']){
   const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
   expect(r.actor.system.attributes.ac.flat).toBe(15);expect(r.actor.system.attributes.hp.value).toBe(30);
  }
  const wrong=raw(c);wrong.creature.attributes.ac=20;
  expect(validateMonsterIntakeIR(c.source,wrong).blocking.some(f=>f.path==='/creature/attributes/ac')).toBe(true);
 });
 test('two conflicting base AC declarations still block',()=>{
  const c=get('roper-independent-appendage-hp');c.units[0].text=c.units[0].text.replace('AC 15\n','AC 15\nAC 16\n');c.source=c.units.map((u:any)=>u.text).join('');
  expect(validateMonsterIntakeIR(c.source,raw(c)).blocking.some(f=>f.code==='CONFLICTING_SOURCE_VALUES')).toBe(true);
 });
});
describe('independent GM conditional damage without a preceding attack',()=>{
 for(const body of ['For every 5 feet Sentinel moves in water, it takes 1 cold damage.','Whenever a creature splashes Sentinel with a gallon of water, Sentinel takes 1 cold damage.'])test(body,async()=>{
  const c=get('hydra-head-count-state'),f=c.features[0];f.name='Water Response';f.text='Water Response. '+body;
  f.operations=[{id:'water',name:'GM conditional self damage',type:'damage',relationship:'follow-up',damage:[{formula:'1',type:'cold',relationship:'conditional'}],proof:{damage:[body]}}];
  for(const u of c.units)if(u.destination==='feature'){u.name=f.name;u.text=f.text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');
  for(const path of ['ordinary','staged']){
   const good=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(good);
   const acts=Object.values(good.actor.items[0].system.activities) as any[];
   expect(acts.map(a=>a.type)).toEqual(['damage']);expect(acts[0].activation.type).toBe('special');expect(acts[0].consumption.targets).toEqual([]);expect(good.actor.items[0].effects).toEqual([]);
  }
  const bad=raw(c);bad.creature.traits[0].sourceOperations[0].damage[0].formula='5';const rejected=await chain(c,()=>ordinary(c,bad));expect(rejected.status).toBe('blocked');expect(rejected.stage).toBe('validator');
 });
});
describe('a source resource retains its existing Utility when its heading is canonicalized',()=>{
 for(const suffix of ['(1/Day)','(Recharge 4-6)','(Recharges after a Short or Long Rest)'])test(suffix,async()=>{
  const c=get('hydra-head-count-state'),f=c.features[0];f.name='Distant Call '+suffix;f.text=f.name+'. Sentinel calls allies that arrive later; the GM resolves their arrival and behaviour.';f.operations=[];
  if(suffix==='(1/Day)')f.uses={max:1,period:'day'};else if(suffix.includes('Short'))f.uses={max:1,period:'shortRest'};else f.recharge=[4,6];
  for(const u of c.units)if(u.destination==='feature'){u.name=f.name;u.text=f.text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');
  const r=await chain(c,()=>staged(c));requireAcceptedChain(r);
  expect(r.ir.creature.traits![0]!.executionMode).toBe('native-with-gm');expect(Number(r.actor.items[0].system.uses.max)).toBe(1);
  const acts=Object.values(r.actor.items[0].system.activities)as any[];expect(acts.map(a=>a.type)).toEqual(['utility']);expect(acts[0].consumption.targets).toMatchObject([{type:'itemUses',value:'1'}]);expect(r.actor.items[0].effects).toEqual([]);
 });
});
test('unconditional damage keeps its Action and cannot claim a conditional follow-up',async()=>{
 const c=get('bronze-breath-exclusive-shared-recharge'),f=c.features[0];f.name='Cold Pulse';f.text='Cold Pulse. Each creature within 10 feet takes 1 cold damage.';delete f.recharge;
 f.operations=[{id:'cold',name:'Cold Damage',type:'damage',relationship:'primary',damage:[{formula:'1',type:'cold',relationship:'base'}],proof:{damage:['Each creature within 10 feet takes 1 cold damage.']}}];
 for(const u of c.units)if(u.destination==='feature'){u.name=f.name;u.text=f.text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');
 for(const path of ['ordinary','staged']){
  const good=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(good);expect((Object.values(good.actor.items[0].system.activities)as any[])[0].activation.type).toBe('action');
  const changed=structuredClone(c);changed.features[0].operations[0].relationship='follow-up';changed.features[0].operations[0].damage[0].relationship='conditional';
  const bad=await chain(changed,()=>path==='ordinary'?ordinary(changed,raw(changed)):staged(changed));expect(bad.status).toBe('blocked');
 }
});
for(const id of ['r3-kraken-fling','r3-ancient-brass-breath-weapons'])test('complete independently researched operation order: '+id,async()=>{
 const c:any=structuredClone(thirdCorpus.cases.find(c=>c.id===id));
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
  const acts=Object.values(r.actor.items[0].system.activities)as any[];expect(acts.map(a=>a.type)).toEqual(id.includes('fling')?['damage','save']:['save','save']);
  if(id.includes('fling'))for(const ac of acts){expect(ac.activation.type).toBe('special');expect(ac.consumption.targets).toEqual([]);}
  else for(const ac of acts)expect(ac.consumption.targets).toMatchObject([{type:'itemUses',value:'1'}]);
 }
});
test('half-on-success belongs to the Save after the Hit, not to a damage choice',async()=>{
 const c:any=structuredClone(fourthCorpus.cases.find(c=>c.id==='r4-giant-wasp-sting'));
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
  const acts=Object.values(r.actor.items[0].system.activities)as any[];expect(acts.map(a=>a.type)).toEqual(['attack','save']);
  expect(acts[1].damage.onSave).toBe('half');expect(acts[1].damage.parts).toHaveLength(1);expect(acts[1].damage.parts[0].types).toEqual(['poison']);
  expect(acts[0].damage.parts.some((p:any)=>p.types?.includes('poison'))).toBe(false);
  expect(r.actor.items[0].effects).toEqual([]);
 }
});
for(const relation of ['of','from','measured from'])test('a remote effect radius cannot become an Actor range: '+relation,async()=>{
 const c:any=structuredClone(fourthCorpus.cases.find(c=>c.id==='r4-gibbering-mouther-blinding-spittle'));
 const f=c.features[0];f.text=f.text.replace('of the flash',relation+' the flash');f.operations[0].proof.save=f.operations[0].proof.save.replace('of the flash',relation+' the flash');
 for(const u of c.units)if(u.destination==='feature')u.text=f.text+'\n';c.source=c.units.map((u:any)=>u.text).join('');
 for(const path of ['ordinary','staged']){
  const good=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(good);
  expect((Object.values(good.actor.items[0].system.activities)as any[])[0].range.value).toBe(15);
  const changed=structuredClone(c);changed.features[0].operations[0].range=5;changed.features[0].operations[0].proof.range=changed.features[0].operations[0].proof.save;
  const bad=await chain(changed,()=>path==='ordinary'?ordinary(changed,raw(changed)):staged(changed));expect(bad.status).toBe('blocked');
 }
});
for(const malformed of [[null],{}])test('malformed operation collections return findings without throwing: '+JSON.stringify(malformed),()=>{
 const c=get('hydra-head-count-state'),ir=raw(c),feature=ir.creature.traits[0];Object.assign(feature,{executionMode:'native-with-gm',nativeRuleText:feature.description,manualRemainder:feature.description,sourceOperations:malformed});
 expect(validateMonsterIntakeIR(c.source,ir).blocking.length).toBeGreaterThan(0);
});
test('a remote template keeps its placement range instead of becoming self',async()=>{
 const c:any=structuredClone(secondCorpus.cases.find(c=>c.id==='r2-djinni-create-whirlwind'));
 for(const path of ['ordinary','staged']){
  const good=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(good);
  const activity=(Object.values(good.actor.items[0].system.activities)as any[])[0];expect(activity.range.value).toBe(120);expect(activity.range.units).toBe('ft');expect(Number(activity.target.template.size)).toBe(5);
  const drift=structuredClone(good.actor);(Object.values(drift.items[0].system.activities)as any[])[0].range={override:true,units:'self',special:''};
  expect(verifyMonsterIntake(c.source,good.ir,good.markdown,drift).findings.some(f=>f.code==='ACTOR_SOURCE_OPERATION_RANGE_DRIFT')).toBe(true);
  const badCase=structuredClone(c);delete badCase.features[0].operations[0].range;delete badCase.features[0].operations[0].proof.range;
  const bad=await chain(badCase,()=>path==='ordinary'?ordinary(badCase,raw(badCase)):staged(badCase));expect(bad.status).toBe('blocked');
 }
});
for(const placement of [80,undefined])test('radius projection preserves independently sourced placement: '+String(placement),async()=>{
 const c=get('hydra-head-count-state'),f=c.features[0],radius=placement?10:20;
 const area=placement?`A ${radius}-foot-radius sphere forms at a point Sentinel can see within ${placement} feet of it.`:`A ${radius}-foot-radius cloud extends from Sentinel.`;
 const roll='Each creature in the area must make a DC 14 Dexterity saving throw, taking 7 (2d6) fire damage on a failed save, or half as much damage on a successful one.';
 f.name='Cloud Pulse';f.text=f.name+'. '+area+' '+roll;f.operations=[{id:'save',name:'GM Save',type:'save',relationship:'primary',save:{dc:14,abilities:['dex'],choice:'single',outcome:'half'},damage:[{formula:'2d6',type:'fire',relationship:'base'}],aoe:{shape:'radius',radius},proof:{save:roll,damage:[roll],aoe:area},...(placement?{range:placement}:{})}];if(placement)f.operations[0].proof.range=area;
 for(const u of c.units)if(u.destination==='feature'){u.name=f.name;u.text=f.text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
  const activity=(Object.values(r.actor.items[0].system.activities)as any[])[0];expect(activity.range).toEqual(placement?{override:true,value:placement,units:'ft',special:''}:{override:true,units:'self',special:''});expect(activity.target.template).toEqual({type:'radius',size:String(radius),units:'ft'});
  const drift=structuredClone(r.actor);(Object.values(drift.items[0].system.activities)as any[])[0].range=placement?{units:'self'}:{value:80,units:'ft'};
  expect(verifyMonsterIntake(c.source,r.ir,r.markdown,drift).findings.some(f=>f.code==='ACTOR_SOURCE_OPERATION_RANGE_DRIFT')).toBe(true);
 }
});
test('negative target eligibility does not negate the Attack predicate',async()=>{
 const c:any=structuredClone(fifthCorpus.cases.find(c=>c.id==='r5-giant-crocodile-tail'));
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
  const acts=Object.values(r.actor.items[0].system.activities)as any[];expect(acts.map(a=>a.type)).toEqual(['attack','save']);expect(acts[0].target.affects.special).toBe('one target not grappled by the crocodile');expect(acts[0].effects).toEqual([]);
  const prone=r.actor.items[0].effects.find((e:any)=>e.statuses.includes('prone'));expect(prone.transfer).toBe(false);expect(acts[1].effects).toContainEqual({_id:prone._id,onSave:false});
 }
 const f=c.features[0],negative=f.text.replace('Melee Weapon Attack:','Not a Melee Weapon Attack:'),ops=structuredClone(f.operations);
 ops[0].proof.attack=ops[0].proof.attack.replace('Melee Weapon Attack:','Not a Melee Weapon Attack:');ops[0].proof.target=ops[0].proof.attack;
 expect(()=>bindSourceOperations(negative,ops)).toThrow('attack/type-or-bonus');
});
test('an on-hit grant remains complete GM work instead of immediate damage',async()=>{
 const c:any=structuredClone(fifthCorpus.cases.find(c=>c.id==='r5-priest-divine-eminence'));
 for(const path of ['ordinary','staged']){
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);expect(Object.values(r.actor.items[0].system.activities).map((a:any)=>a.type)).toEqual(['utility']);expect(r.actor.items[0].effects).toEqual([]);expect(r.ir.creature.spellcasting).toBeUndefined();expect(Number(r.actor.items[0].system.uses?.max??0)).toBe(0);
 }
 const bad=raw(c);Object.assign(bad.creature.traits[0],c.irProbes.find((p:any)=>p.id==='on-hit-grant-not-immediate-damage').assign);
 const result=await chain(c,()=>ordinary(c,bad));expect(result.status).toBe('blocked');
});
test('redundant on-a-hit wording in a Hit result keeps the original base damage',async()=>{
 const c=get('flat-roll-threshold-not-margin'),f=c.features[0];f.name='Strike';f.text='Strike. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) fire damage on a hit.';
 f.operations=[{id:'attack',name:'Attack',type:'attack',relationship:'primary',attack:{type:'mwak',toHit:4,reach:5},targetSpecial:'one target',damage:[{formula:'1d6+2',type:'fire',relationship:'base'}],proof:{attack:'Melee Weapon Attack: +4 to hit, reach 5 ft., one target.',target:'Melee Weapon Attack: +4 to hit, reach 5 ft., one target.',damage:['Hit: 5 (1d6 + 2) fire damage on a hit.']}}];
 for(const u of c.units)if(u.destination==='feature'){u.name=f.name;u.text=f.text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');
 for(const path of ['ordinary','staged'])requireAcceptedChain(await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c)));
});
describe('named casting declarations versus references',()=>{
 for(const text of [
  'Invisibility. Sentinel turns invisible until it attacks or casts a spell, or until its concentration ends.',
  'Hidden. Sentinel remains hidden until it casts fireball.',
  'Hidden. Sentinel remains invisible until it moves 30 ft. or casts fireball.',
  'Stored Magic. The wearer must cast the spell on Sentinel. On command, Sentinel casts the stored spell using the original caster parameters.',
  'Trigger. Whenever a creature casts fireball, Sentinel becomes visible.',
  'Borrowed Magic. The wearer may cast fireball.',
  'Borrowed Magic. The wearer can innately cast fireball.',
  'Witness. Sentinel can see a spell cast outside the barrier.',
  'No Magic. Sentinel cannot speak or cast fireball.',
  'No Magic. Sentinel cannot normally cast fireball.',
  'Spell Mastery. You can cast them at will.',
  'Globe. Any spell cast from outside the barrier cannot affect a target inside.',
  'Contingency. For example, a contingency cast with water breathing might last for hours.',
  'Absence. Sentinel casts no shadow.',
  'Warning. Sentinel can broadcast danger.',
 ])test('does not infer a grant: '+text,()=>expect(sourceSingleSpellAction(text)).toBeUndefined());
 for(const [text,name]of [
  ['Web. Sentinel casts web.','web'],
  ['Fireball. Sentinel casts fireball without material components.','fireball'],
  ['Custom Magic. Sentinel casts Spell Storm.','Spell Storm'],
  ['Touch. Sentinel touches the wearer and casts shield.','shield'],
  ['Bluff. If threatened Sentinel lies. Web. Sentinel casts web.','web'],
  ['Web. You can use an action to cast web.','web'],
  ['Magic. Sentinel can also cast fireball.','fireball'],
  ['Magic. Sentinel can innately cast fireball.','fireball'],
  ['Magic. Sentinel may also magically cast shield.','shield'],
 ])test('keeps a real named grant: '+name,()=>{const r=sourceSingleSpellAction(text!);expect(r?.name).toBe(name!);expect(text!.slice(r!.start,r!.end)).toBe(name!);});
 for(const text of ['Sentinel can cast fireball.','Sentinel can also cast fireball.','Sentinel can innately cast fireball.'])test('a genuine named grant cannot escape as manual text: '+text,async()=>{
  const c=get('invisibility-break-and-concentration');c.features[0].text=text;
  for(const u of c.units)if(u.destination==='feature')u.text=text+'\n';c.source=c.units.map((u:any)=>u.text).join('');
  const result=await chain(c,()=>ordinary(c,raw(c)));
  expect(result.status).toBe('blocked');expect(result.stage).toBe('validator');expect(result.findings?.some(f=>/spell|casting/iu.test(f.code+' '+f.message))).toBe(true);
 });
 for(const id of ['invisibility-break-and-concentration','stored-spell-replace-original-caster'])test(id+' works through both formal paths with complete GM text',async()=>{
  const c=get(id);for(const path of ['ordinary','staged']){
   const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
   expect(normalize(r.actor.items[0].system.description.value)).toContain(normalize(c.features[0].text));
   expect(Object.values(r.actor.items[0].system.activities).map((a:any)=>a.type)).toEqual(['utility']);
  }
 });
});
describe('source-declared sibling choices share the same native counter',()=>{
 test('two named breaths are exclusive choices with one recharge pool',async()=>{
  const c=get('bronze-breath-exclusive-shared-recharge');for(const path of ['ordinary','staged']){
   const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
   const item=r.actor.items[0],acts=Object.values(item.system.activities) as any[];
   expect(acts.map(a=>a.save.ability)).toEqual([['dex'],['str']]);
   expect(item.system.uses).toEqual({spent:0,max:'1',recovery:[{period:'recharge',type:'recoverAll',formula:'5'}]});
   for(const a of acts){expect(a.consumption.targets).toHaveLength(1);expect(a.consumption.targets[0]).toMatchObject({type:'itemUses',target:'',value:'1'});if(a.consumption.targets[0].scaling)expect(a.consumption.targets[0].scaling).toEqual({mode:'',formula:''});}
   expect(acts[0].damage.onSave).toBe('half');expect(acts[1].damage.parts).toEqual([]);
  }
 });
 test('named period headings work and a negated selector proves no alternative',()=>{
  const c=get('bronze-breath-exclusive-shared-recharge'),f=c.features[0];
  const source=f.text.replace('Lightning Breath: ','Lightning Breath. ').replace('Repulsion Breath: ','Repulsion Breath. ');
  const ops=f.operations.map((op:any)=>({...op,proof:{...op.proof,save:op.proof.save.replace(/^(Lightning Breath|Repulsion Breath): /u,'')}}));
  if(ops[0].proof.damage)ops[0].proof.damage=ops[0].proof.damage.map((q:string)=>q.replace(/^Lightning Breath: /u,''));
  expect(()=>bindSourceOperations(source,ops)).not.toThrow();
  expect(()=>bindSourceOperations(source.replace('uses one of the following','cannot use one of the following'),ops)).toThrow('unproven-alternative');
  const results=source.replace('Lightning Breath.','First Failure.').replace('Repulsion Breath.','Second Failure.');
  expect(()=>bindSourceOperations(results,ops)).toThrow('unproven-alternative');
 });
 test('a common delayed Save is a follow-up and cannot consume another breath',async()=>{
  const c=get('bronze-breath-exclusive-shared-recharge'),f=c.features[0];
  const tail='After Either Breath: At the end of its next turn, each affected creature must succeed on a DC 12 Strength saving throw or be pushed 60 feet away.';
  f.text=f.text.slice(0,f.text.indexOf('Repulsion Breath:'))+'Silent Breath: Sentinel exhales harmless smoke in a 30-foot cone. '+tail;
  f.operations[1].proof.save=tail;f.operations[1].relationship='follow-up';
  for(const u of c.units)if(u.destination==='feature')u.text=f.text+'\n';c.source=c.units.map((u:any)=>u.text).join('');
  for(const path of ['ordinary','staged']){
   const good=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(good);
   const acts=Object.values(good.actor.items[0].system.activities)as any[];expect(acts[1].activation.type).toBe('special');expect(acts[1].consumption.targets).toEqual([]);
  }
  const bad=raw(c);bad.creature.actions[0].sourceOperations[1].relationship='alternative';
  const rejected=await chain(c,()=>ordinary(c,bad));expect(rejected.status).toBe('blocked');expect(rejected.findings?.some(f=>f.message.includes('unproven-alternative'))).toBe(true);
 });
});

// Fresh round failures stay as complete source regressions; the opt-in corpus
// is not a default hook and these five cases do not replay the full batch.
const iterativeCase=(id:string):any=>structuredClone(iterate50Corpus.cases.find(c=>c.id===id));
for(const id of ['r10m-dryad-fey-charm','r10m-cloaker-moan','r10m-druid-quarterstaff','r10m-insect-swarms-variant','r10r-bag-of-beans'])for(const path of ['ordinary','staged'])test('iterative source repair '+id+' '+path,async()=>{
 const c=iterativeCase(id),r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
 expect(normalize(r.actor.items[0].system.description.value)).toContain(normalize(c.features[0].text));
 if(id==='r10m-dryad-fey-charm')expect((Object.values(r.actor.items[0].system.activities)as any[])[0].range.value).toBe(30);
 if(id==='r10m-cloaker-moan'){
  const save=(Object.values(r.actor.items[0].system.activities)as any[]).find(a=>a.type==='save');expect(save.target.template.type).toBe('radius');expect(save.target.template.size).toBe('60');expect(save.range.units).toBe('self');
 }
 if(id==='r10m-druid-quarterstaff'){
  const activities=Object.values(r.actor.items[0].system.activities)as any[];expect(activities.filter(a=>a.type==='attack').map(a=>a.attack.bonus)).toEqual(['2','4']);expect(activities.filter(a=>a.type==='damage')).toHaveLength(3);expect(r.actor.items[0].system.properties??[]).not.toContain('ver');
 }
 if(id==='r10m-insect-swarms-variant'){
  expect(r.ir.creature.identity.creatureType).toBe('construct');expect(r.actor.items).toHaveLength(1);expect(r.actor.system.attributes.movement.fly).toBe(40);expect(r.actor.system.attributes.movement.burrow??0).toBe(0);
 }
 if(id==='r10r-bag-of-beans'){
  expect(r.ir.creature.traits[0].healing).toBeUndefined();expect(Object.values(r.actor.items[0].system.activities).some((a:any)=>a.type==='heal')).toBe(false);
 }
});
for(const gender of ['female','male','renamed'])test('gendered range requires the same source Actor and seeing pronoun '+gender,async()=>{
 let c=iterativeCase('r10m-dryad-fey-charm');
 if(gender==='male')c=JSON.parse(JSON.stringify(c).replace(/\bshe\b/gu,'he').replace(/\bher\b/gu,'him'));
 if(gender==='renamed')c=JSON.parse(JSON.stringify(c).replace(/Dryad/gu,'Priestess').replace(/dryad/gu,'priestess'));
 const r=await chain(c,()=>ordinary(c,raw(c)));requireAcceptedChain(r);expect((Object.values(r.actor.items[0].system.activities)as any[])[0].range.value).toBe(30);
});
for(const edit of ['foreign-subject','different-pronoun'])test('a foreign or mismatched gendered origin cannot borrow Actor range '+edit,async()=>{
 let c=iterativeCase('r10m-dryad-fey-charm');c=JSON.parse(JSON.stringify(c).replaceAll(edit==='foreign-subject'?'The dryad targets':'feet of her.',edit==='foreign-subject'?"The dryad's ally targets":'feet of him.'));
 const r=await chain(c,()=>ordinary(c,raw(c)));expect(r.status).toBe('blocked');
});
for(const label of ['Prototype Types','Guardian Types','Insect Swarms (four variant types)'])test('Types in an Actor title is not a Type declaration '+label,async()=>{
 let c=iterativeCase('r10m-insect-swarms-variant');const previous=c.creature.identity.name;c.creature.identity.name=label;c.units[0].text=c.units[0].text.replace(previous,label);c.source=c.units.map((u:any)=>u.text).join('');
 const r=await chain(c,()=>ordinary(c,raw(c)));requireAcceptedChain(r);expect(r.ir.creature.identity.creatureType).toBe('construct');
 const bad=raw(c);bad.creature.identity.creatureType='beast';expect((await chain(c,()=>ordinary(c,bad))).status).toBe('blocked');
});
test('radial target proof keeps a foreign flash origin manual',async()=>{
 let c=iterativeCase('r10m-cloaker-moan');c=JSON.parse(JSON.stringify(c).replaceAll('of the cloaker that','of the flash that'));expect((await chain(c,()=>ordinary(c,raw(c)))).status).toBe('blocked');
});
for(const path of ['ordinary','staged'])test('an own emanation radius cannot become a remote placement range '+path,async()=>{
 const c=iterativeCase('r10m-cloaker-moan'),ops=c.features[0].operations;ops[0].range=60;ops[0].proof.range=ops[0].proof.aoe;
 const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));expect(r.status).toBe('blocked');
});
test('a standalone variant title does not permit clipping later branches or arbitrary colon prose',async()=>{
 const c=iterativeCase('r10m-insect-swarms-variant'),bad=raw(c);bad.creature.traits[0].description=bad.creature.traits[0].description.split('Swarm of Wasps.')[0];expect((await chain(c,()=>ordinary(c,bad))).status).toBe('blocked');
 const unknown=JSON.parse(JSON.stringify(c).replaceAll('Variant: Insect Swarms','Warning: Insect Swarms'));expect((await chain(unknown,()=>staged(unknown))).status).toBe('blocked');
});

// Only the four newly failing parents, plus boundary counterexamples; no batch replay.
for(const id of ['r11m-half-dragon-template','r11r-poisons','r11r-falling-net','r11r-rolling-sphere'])for(const path of ['ordinary','staged'])test('second iterative repair '+id+' '+path,async()=>{
 const c:any=structuredClone(iterate50Round2.cases.find(c=>c.id===id));
 const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
 expect(normalize(r.actor.items[0].system.description.value)).toContain(normalize(c.features[0].text));
 const activities=Object.values(r.actor.items[0].system.activities)as any[];
 if(id==='r11r-poisons'){expect(activities).toHaveLength(16);expect(activities.filter(a=>a.type==='save')).toHaveLength(14);}
 if(id==='r11r-falling-net'){expect(activities.map(a=>a.type)).toEqual(['save']);expect(activities[0].save.ability).toEqual(['str']);expect(activities[0].damage.parts).toEqual([]);}
 if(id==='r11r-rolling-sphere'){expect(activities.map(a=>a.type)).toEqual(['save']);expect(activities[0].save.dc.formula).toBe('15');expect(activities[0].damage.parts[0].number).toBe(10);}
});
for(const title of ['Half-Dragon Template','Borrowed Identity','Echo of the Tower'])test('a complete physical title at a source section boundary '+title,async()=>{
 const c:any=structuredClone(iterate50Round2.cases.find(c=>c.id==='r11m-half-dragon-template'));
 c.features[0].text=c.features[0].text.replace('Half-Dragon Template',title);c.features[0].name=title;
 for(const u of c.units)if(u.destination==='feature'){u.name=title;u.text=c.features[0].text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');
 expect(splitStagedMonsterSource(request(c.source)).features.map(f=>f.name)).toEqual([title]);
 for(const path of ['ordinary','staged'])requireAcceptedChain(await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c)));
 const flat=structuredClone(c);flat.features[0].text=flat.features[0].text.replace(title+'\n',title+' ');for(const u of flat.units)if(u.destination==='feature')u.text=flat.features[0].text+'\n';flat.source=flat.units.map((u:any)=>u.text).join('');
 expect((await chain(flat,()=>ordinary(flat,raw(flat)))).status).toBe('blocked');
});
for(const heading of ['Medium Construct','Strength Dexterity Constitution','Color Damage Resistance','The'])test('stat and table labels cannot become a standalone ability '+heading,()=>{
 const c:any=structuredClone(iterate50Round2.cases.find(c=>c.id==='r11m-half-dragon-template'));
 const source=c.units.filter((u:any)=>u.destination!=='feature').map((u:any)=>u.text).join('')+heading+'\nA creature retains its original appearance.\n';
 expect(()=>splitStagedMonsterSource(request(source))).toThrow();
});
test('a standalone parent cannot swallow a later explicit feature or split at a wrapped title',async()=>{
 const c:any=structuredClone(iterate50Round2.cases.find(c=>c.id==='r11m-half-dragon-template'));
 const source=c.source+'\n## Watch. The guardian remains alert.\n';const plan=splitStagedMonsterSource(request(source));
 expect(plan.features.map(f=>f.name)).toEqual(['Half-Dragon Template','Watch']);
 const wrong=structuredClone(c);wrong.source=source;wrong.features[0].text+='\n## Watch. The guardian remains alert.';wrong.units[wrong.units.length-1].text=wrong.features[0].text+'\n';
 expect((await chain(wrong,()=>ordinary(wrong,raw(wrong)))).status).toBe('blocked');
 const continuation=c.source.replace('A beast,', 'Silent Branch\nA beast,');expect(splitStagedMonsterSource(request(continuation)).features).toHaveLength(1);
});

const round3Case=(id:string):any=>structuredClone(iterate50Round3.cases.find(c=>c.id===id));
for(const id of ['r12m-srd52-aboleth-legendary-resistance','r12m-srd52-kraken-toxic-ink','r12m-srd52-lich-deathly-teleport','r12m-srd52-sphinx-lore-weight-years','r12m-srd52-tarrasque-world-shaking-movement','r12m-srd52-sphinx-valor-roar','r12r-elemental-fury','r12r-javelin-of-lightning'])for(const path of ['ordinary','staged'])test('third iterative repair '+id+' '+path,async()=>{
 const c=round3Case(id),r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
 expect(normalize(r.actor.items[0].system.description.value)).toContain(normalize(c.features[0].text));
 if(id.endsWith('legendary-resistance')){expect(r.ir.creature.traits[0].uses).toBeUndefined();expect(Number(r.actor.items[0].system.uses?.max??0)).toBe(0);}
 if(c.features[0].section==='legendary'){
  expect(r.ir.creature.legendaryActions[0].legendaryCost).toBe(1);
  const fixed=id.includes('world-shaking');expect(r.ir.creature.legendary?.max).toBe(3);expect(r.actor.system.resources.legact.max).toBe(3);
  if(!fixed){expect(r.ir.creature.legendary?.lairMax).toBe(4);expect(r.actor.system.resources.lair).toMatchObject({value:true,inside:false});expect(normalize(r.actor.items[0].system.description.value)).toContain('Legendary Action Uses: 3 (4 in Lair)');}
 }
 if(id.endsWith('sphinx-valor-roar'))expect((Object.values(r.actor.items[0].system.activities)as any[]).map(a=>a.save.ability)).toEqual([['wis'],['wis'],['con']]);
 if(id.endsWith('elemental-fury')){const a=(Object.values(r.actor.items[0].system.activities)as any[])[0];expect(a.damage.parts).toHaveLength(1);expect(a.damage.parts[0].types).toEqual(['cold','fire','lightning','thunder']);}
});
for(const max of [3,4,99])test('conditional resource variants cannot become an unconditional daily maximum '+max,async()=>{
 const c=round3Case('r12m-srd52-aboleth-legendary-resistance'),ir=raw(c);ir.creature.traits[0].uses={max,period:'day'};
 expect((await chain(c,()=>ordinary(c,ir))).status).toBe('blocked');
});
for(const max of [3,4,99])test('a shared conditional ledger cannot prove an unselected Actor pool '+max,async()=>{
 const c=round3Case('r12m-srd52-kraken-toxic-ink'),ir=raw(c),u=c.units[1],start=c.units[0].text.length;
 ir.creature.legendary={max,preamble:u.text.trim(),evidence:[{start,end:start+u.text.length,quote:u.text}]};
 const r=await chain(c,()=>ordinary(c,ir));expect(r.status).toBe('blocked');expect(r.findings?.some((f:any)=>f.code==='SOURCE_LEGENDARY_MODE_REQUIRED')).toBe(true);
});
test('the nearest shared action ledger proves its own cost, not an arbitrary supplied context',async()=>{
 const c=round3Case('r12m-srd52-kraken-toxic-ink'),ir=raw(c);ir.creature.legendaryActions[0].legendaryCost=2;
 expect((await chain(c,()=>ordinary(c,ir))).status).toBe('blocked');
 const foreign=raw(c);foreign.creature.legendaryActions[0].sourceContext=['Legendary Actions\nLegendary Action Uses: 99. An unrelated ally can expend a use.'];
 expect((await chain(c,()=>ordinary(c,foreign))).status).toBe('blocked');
});

test('another Actor shared ledger cannot fund this Actor pool',async()=>{
 const c=round3Case('r12m-srd52-tarrasque-world-shaking-movement');c.units[1].text=c.units[1].text.replace(/the tarrasque/giu,'the summoner');c.source=c.units.map((u:any)=>u.text).join('');
 const r=await chain(c,()=>ordinary(c,raw(c)));expect(r.status).toBe('blocked');expect(r.findings?.some((f:any)=>f.code==='SOURCE_LEGENDARY_OWNER_CONFLICT')).toBe(true);
});

for(const path of ['ordinary','staged'])test('a translated Actor keeps its source English ledger owner '+path,async()=>{
 const c=round3Case('r12m-srd52-tarrasque-world-shaking-movement');c.creature.identity.englishName=c.creature.identity.name;c.creature.identity.name='撼地兽';c.units[0].text=c.units[0].text.replace('Tarrasque CR 2','撼地兽 (Tarrasque) CR 2');c.source=c.units.map((u:any)=>u.text).join('');
 const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);expect(r.ir.creature.legendary?.max).toBe(3);expect(r.ir.creature.legendaryActions[0].legendaryCost).toBe(1);
});

test('ledger shortened owners must retain the Actor noun-phrase head',()=>{
 const ledger=(consume:string,recover=consume)=>{const quote=`Legendary Actions\nLegendary Action Uses: 3. Immediately after another creature’s turn, the ${consume} can expend a use to take one of the following actions. The ${recover} regains all expended uses at the start of each of its turns.\n`;return{id:'context',destination:'context' as const,section:'legendary' as const,start:0,end:quote.length,quote};};
 expect(stagedLegendaryLedger(ledger('dragon'),'Dragon Summoner')).toBeUndefined();
 expect(stagedLegendaryLedger(ledger('summoner'),'Dragon Summoner')?.max).toBe(3);
 expect(stagedLegendaryLedger(ledger('black dragon'),'Ancient Black Dragon')?.max).toBe(3);
 expect(stagedLegendaryLedger(ledger('dragon','summoner'),'Ancient Black Dragon')).toBeUndefined();
 expect(stagedLegendaryLedger(ledger('dragon','it'),'Ancient Black Dragon')?.max).toBe(3);
 expect(stagedLegendaryLedger(ledger('sphinx'),'Sphinx of Lore')?.max).toBe(3);
});

// The three new product failures and one corrected provider lookup retain full
// parents. Previously passing round-four parents are not replayed here.
const round4Case=(id:string):any=>structuredClone(iterate50Round4.cases.find(c=>c.id===id));
for(const id of ['r13m-srd52-erinyes-entangling-rope','r13m-srd52-storm-giant-lightning-storm','r13r-lands-aid'])for(const path of ['ordinary','staged'])test('fourth iterative repair '+id+' '+path,async()=>{
 const c=round4Case(id),r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
 const item=r.actor.items.find((item:any)=>normalize(item.system.description.value).includes(normalize(c.features[0].text)));expect(item).toBeDefined();
 const acts=Object.values(item.system.activities)as any[];
 if(id.endsWith('entangling-rope')){expect(r.actor.items).toHaveLength(2);expect(acts[0].save.ability).toEqual(['str']);expect(acts[0].save.dc.formula).toBe('16');}
 if(id.endsWith('lightning-storm')){expect(acts[0].target.template.type).toBe('cylinder');expect(Number(acts[0].target.template.size)).toBe(10);expect(Number(acts[0].range.value)).toBe(500);expect(acts[0].damage.onSave).toBe('half');}
 if(id.endsWith('lands-aid')){expect(acts.map(a=>a.type)).toEqual(['damage']);expect(acts[0].damage.parts[0].number).toBe(2);expect(acts[0].damage.parts[0].types).toEqual(['necrotic']);expect(acts[0].consumption.targets).toEqual([]);}
});

for(const path of ['ordinary','staged']){
 test('the complete frozen Apparatus guessed weapon classification stays rejected '+path,async()=>{
  const c=round4Case('r13r-apparatus-of-the-crab'),before=JSON.stringify(c),r:any=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));
  expect(r.status).toBe('blocked');
  if(path==='ordinary'){
   expect(r.stage).toBe('validator');expect(r.findings.some((f:any)=>f.code==='SOURCE_OPERATION_FACT_CONFLICT'&&f.path.endsWith('/attack/type-or-bonus'))).toBe(true);
  }else{
   expect(r.stage).toBe('extraction');expect(r.error).toContain('FEATURE_FACT_CONFLICT');expect(r.error).toContain('/attack/type-or-bonus');
  }
  expect(JSON.stringify(c)).toBe(before);
 });
 test('new neutral-contract variant preserves the complete Apparatus formal chain '+path,async()=>{
  const frozen=round4Case('r13r-apparatus-of-the-crab'),before=JSON.stringify(frozen),c=structuredClone(frozen);
  c.features[0].operations=newNeutralAttackContractVariant(frozen.features[0].operations,'melee');
  const r=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(r);
  const item=r.actor.items.find((item:any)=>normalize(item.system.description.value).includes(normalize(c.features[0].text)));expect(item).toBeDefined();
  const acts=Object.values(item.system.activities)as any[];
  expect(acts.map(a=>a.type)).toEqual(['damage','utility','damage','utility']);
  expect(acts[0].damage.parts[0].number).toBe(2);expect(acts[2].damage.parts[0].number).toBe(2);
  for(const roll of [acts[1],acts[3]]){expect(roll.roll.formula).toBe('1d20+8');expect(roll.attack).toBeUndefined();expect(roll.damage).toBeUndefined();}
  expect(item.type).not.toBe('weapon');expect(item.effects).toEqual([]);
  expect(r.actor.system.attributes.ac.flat).toBe(c.creature.attributes.ac);expect(r.actor.system.attributes.hp.max).toBe(c.creature.attributes.hp.value);
  expect(c.source).toBe(frozen.source);expect(c.features[0].text).toBe(frozen.features[0].text);expect(JSON.stringify(frozen)).toBe(before);
 });
}

// Round 5 intake repair: narrow source boundaries, recipients and origins.
const r5Source=(body:string)=>'Sentinel CR 2\nAC 15\nHP 30 (4d8 + 12) Size Medium\nSpeed 30 ft. Type Construct\nSTR 14 DEX 10 CON 16 INT 3 WIS 10 CHA 1\nTraits\n'+body+'\n';
const r5Carrier=(source:string,rangeQuote:string,range:number,areaQuote?:string):any=>({name:'Vortex',description:source,activityType:'utility',executionMode:'native-with-gm',nativeRuleText:source,manualRemainder:source,sourceOperations:[{id:'save',name:'Save',type:'save',relationship:'primary',range,proof:{range:rangeQuote,...(areaQuote?{aoe:areaQuote}:{})},...(areaQuote?{aoe:{shape:'cylinder',radius:20}}:{})}]});
const r5RangeErrors=(source:string,quote:string,range:number,actor='Sentinel',area?:string)=>sourceOperationFeatureErrors(r5Carrier(source,quote,range,area),actor).filter(e=>e.field.includes('/range'));

test('round5 empty section headings do not invent a missing trait, but real omitted content still blocks',()=>{
 const c=get('hydra-head-count-state');
 c.features[0].section='action';for(const u of c.units){if(u.destination==='context'){u.section='action';u.text='Traits\nActions\n';}if(u.destination==='feature')u.section='action';}c.source=c.units.map((u:any)=>u.text).join('');
 const ir=raw(c);assert.equal(validateMonsterIntakeIR(c.source,ir).blocking.some(f=>f.code==='MISSING_SOURCE_FEATURES'&&f.path==='/creature/traits'),false);
 ir.creature.actions=[];assert.equal(validateMonsterIntakeIR(c.source,ir).blocking.some(f=>f.code==='MISSING_SOURCE_FEATURES'&&f.path==='/creature/actions'),true);
});

test('round5 classified and level headings retain physical boundaries in LF and CRLF',()=>{
 for(const name of ['Burning [Hazard]','Exhaustion [Condition]','Cylinder [Area of Effect]','Level 13: Improved Brutal Strike'])for(const newline of ['\n','\r\n']){
  const source=r5Source(name+'\nThe sentinel waits for the GM.').replace(/\n/gu,newline),plan=splitStagedMonsterSource(request(source));
  assert.deepEqual(plan.features.map(f=>f.name),[name]);assert.equal(plan.features[0]!.quote.trim(),(name+'\nThe sentinel waits for the GM.').replace(/\n/gu,newline));
 }
 for(const name of ['Strength Dexterity Constitution','Level 3:','Level 3: You can attack','Burning [Anything]','Burning [Hazard] A creature takes damage'])assert.throws(()=>splitStagedMonsterSource(request(r5Source(name+'\nThe sentinel waits.'))));
 const source=r5Source('Mark. The sentinel can use\nBurning [Hazard]\nonly after a successful check.');assert.equal(splitStagedMonsterSource(request(source)).features.length,1);
});

test('round5 source range subjects preserve noun heads, self pronouns and foreign-origin guards',()=>{
 for(const [actor,origin]of [['Gibbering Mouther','the mouther'],['Sphinx of Lore','the sphinx'],['Ancient Black Dragon','the black dragon'],['Sentinel','yourself'],['Sentinel','you']]){
  const quote=`Any creature within 20 feet of ${origin} while it is babbling makes a saving throw.`;assert.deepEqual(r5RangeErrors('Gibbering. '+quote,quote,20,actor),[]);
 }
 for(const [actor,origin]of [['Dragon Summoner','the dragon'],['Sentinel','the target'],['Sentinel','the flash'],['Sentinel','an ally'],['Gibbering Mouther','the gibbering']]){
  const quote=`Any creature within 20 feet of ${origin} while it is babbling makes a saving throw.`;assert.equal(r5RangeErrors('Gibbering. '+quote,quote,20,actor).length,1);
 }
 const quote='While holding the rod, you can force each creature you can see within 30 feet of yourself to make a DC 17 Wisdom saving throw.';assert.deepEqual(r5RangeErrors('Terrify. '+quote,quote,30),[]);
});

test('round5 remote geometry binds only the immediately preceding own selected point',()=>{
 const range='The sentinel conjures a whirlwind at a point it can see within 120 feet.',area='The whirlwind fills a 20-foot-radius, 60-foot-high Cylinder centered on that point.';
 assert.deepEqual(r5RangeErrors('Vortex. '+range+' '+area,range,120,'Sentinel',area),[]);
 assert.equal(r5RangeErrors('Vortex. '+range+' '+area,range,20,'Sentinel',area).length>0,true);
 for(const text of ['Vortex. '+range+' It moves 20 feet. '+area,'Vortex. '+range.replace('sentinel','target')+' '+area]){
  const proof=text.includes('The target')?range.replace('sentinel','target'):range;assert.equal(r5RangeErrors(text,proof,120,'Sentinel',area).length>0,true);
 }
});

const r5HealingSources=[
 {name:'Psychic Drain',actor:'Aboleth',text:'Psychic Drain. If the aboleth has at least one creature Charmed or Grappled, it uses Consume Memories and regains 5 (1d10) Hit Points.',formula:'1d10',type:'healing',target:{type:'self',count:1,special:'the aboleth'}},
 {name:'War Cry (Recharge 5–6)',actor:'Frost Giant',text:'War Cry (Recharge 5–6). The giant or one creature of its choice that can see or hear it gains 16 (2d10 + 5) Temporary Hit Points and has Advantage on attack rolls until the start of the giant’s next turn.',formula:'2d10+5',type:'temphp',target:{type:'creature',count:1,special:'The giant or one creature of its choice that can see or hear it'}},
 {name:'Mending',actor:'Sentinel',text:'Mending. The sentinel regains 9 (2d8) Hit Points.',formula:'2d8',type:'healing',target:{type:'self',count:1,special:'The sentinel'}},
 {name:'Ward',actor:'Sentinel',text:'Ward. You gain 4 Temporary Hit Points.',formula:'4',type:'temphp',target:{type:'self',count:1,special:'You'}},
];
test('round5 fixed healing retains exact dice, kind, recipient and full GM qualification',()=>{
 for(const s of r5HealingSources){
  const healing=sourceFixedHealing(s.text,s.name,s.actor);assert.deepEqual(healing,{formula:s.formula,type:s.type,target:s.target});
  const feature:any={name:s.name,description:s.text,activityType:'heal',executionMode:'native-with-gm',nativeRuleText:s.text,manualRemainder:s.text,healing,...(s.name.includes('Recharge')?{recharge:[5,6]}:{})};
  assert.equal(mixedFeatureSourceMatches(feature,'traits',s.actor),true);
  for(const altered of [{...healing,formula:'9d20'},{...healing,type:s.type==='healing'?'temphp':'healing'},{...healing,target:{...s.target,type:s.target.type==='self'?'creature':'self'}},{...healing,target:{...s.target,special:'one creature'}},{...healing,target:{...s.target,count:2}}])assert.equal(mixedFeatureSourceMatches({...feature,healing:altered},'traits',s.actor),false);
 }
 for(const text of ['Ward. You cannot gain 4 Temporary Hit Points.','Mending. The sentinel loses 9 (2d8) Hit Points.','Mending. The target regains 9 (2d8) Hit Points.','Drain. You regain Hit Points equal to half the damage dealt.','Ward. One creature of your choice gains 4 Temporary Hit Points.'])assert.equal(sourceFixedHealing(text,text.split('.')[0]!,'Sentinel'),undefined);
});

test('round5 staged manual replies restore only proven fixed healing and keep full original rules',()=>{
 for(const s of r5HealingSources){
  const source=r5Source(s.text),plan=splitStagedMonsterSource(request(source)),unit=plan.features[0]!;
  const feature=assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}},s.actor);
  assert.equal(feature.executionMode,'native-with-gm');assert.deepEqual(feature.healing,{formula:s.formula,type:s.type,target:s.target});assert.equal(feature.manualRemainder,s.text);assert.equal(feature.range,undefined);assert.equal(feature.appliedConditions,undefined);
  assert.throws(()=>assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{healing:{formula:'9d20',type:s.type,target:s.target}}},s.actor));
 }
 const source=r5Source('Drain. You regain Hit Points equal to half the damage dealt.'),plan=splitStagedMonsterSource(request(source)),unit=plan.features[0]!;
 const feature=assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}},'Sentinel');assert.equal(feature.healing,undefined);assert.equal(feature.executionMode,'gm-manual');
});

test('round5 ordinary exact mixed healing receives missing source target but never overwrites a conflict',()=>{
 for(const s of r5HealingSources){
  const c=get('hydra-head-count-state'),f=c.features[0];f.name=s.name;f.text=s.text;f.operations=[];f.legacy={executionMode:'native-with-gm',activityType:'heal',nativeRuleText:s.text,manualRemainder:s.text,healing:{formula:s.formula,type:s.type}};
  for(const u of c.units)if(u.destination==='feature'){u.name=s.name;u.text=s.text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');const ir=raw(c);ir.creature.identity.name=s.actor;
  const anchored=anchorIrEvidence(c.source,request(c.source).candidate,ir);assert.deepEqual(anchored.creature.traits[0]!.healing?.target,s.target);
  ir.creature.traits[0].healing.target={type:'self',count:1,special:'WRONG recipient'};const wrong=anchorIrEvidence(c.source,request(c.source).candidate,ir);assert.equal(wrong.creature.traits[0]!.healing?.target?.special,'WRONG recipient');assert.equal(mixedFeatureSourceMatches(wrong.creature.traits[0]!,'traits',s.actor),false);
 }
});

test('round5 Heal parser and Activity preserve proven recipients; legacy input retains its old self target',()=>{
 const parser=new StructuredActionParser(),generator=new ActivityGenerator({fvttVersion:'14'});
 for(const s of r5HealingSources){
  const parsed=parser.parseStructuredSection([{名称:s.name,类型:'heal',治疗:{公式:s.formula,类型:s.type,target:s.target}}],'traits')[0]!;
  const action:any={name:s.name,type:'heal',healing:parsed.healing};const activity:any=Object.values(generator.generate(action))[0];
  assert.deepEqual(activity.target,{override:false,prompt:s.target.type==='creature',template:{count:'',contiguous:false,type:'',size:'',width:'',height:'',units:'ft'},affects:{count:'1',type:s.target.type,choice:false,special:s.target.special}});
  assert.deepEqual(activity.range,s.target.type==='creature'?{units:'spec',special:s.target.special,override:false}:undefined);assert.equal(activity.healing.types[0],s.type);
 }
 const legacy=parser.parseStructuredSection([{名称:'Legacy',类型:'heal',治疗:{公式:'1d6',类型:'healing'}}],'traits')[0]!;assert.equal(legacy.healing?.target,undefined);const old:any=Object.values(generator.generate({name:'Legacy',type:'heal',healing:legacy.healing}))[0];assert.deepEqual(old.target.affects,{count:'1',type:'self',choice:false,special:''});assert.equal(old.target.prompt,false);
 for(const target of [{type:'creature',count:2,special:'one creature'},{type:'object',count:1,special:'an object'},{type:'creature',count:1},{type:'creature',count:1,special:'one creature',range:30}])assert.throws(()=>parser.parseStructuredSection([{名称:'Wrong',类型:'heal',治疗:{公式:'1d6',类型:'healing',target}}],'traits'));
 const unrelated:any=Object.values(generator.generate({name:'Unrelated',type:'damage',damage:[{formula:'1d6',type:'fire'}]}))[0];assert.equal(unrelated.type,'damage');assert.equal(unrelated.healing,undefined);
});

for(const id of ['r14m-srd52-aboleth-psychic-drain','r14m-srd52-frost-giant-war-cry'])for(const path of ['ordinary','staged'])test('round5 full-source healing regression '+id+' '+path,async()=>{
 const c:any=structuredClone(iterate50Round5.cases.find(c=>c.id===id)),result=await chain(c,()=>path==='ordinary'?ordinary(c,raw(c)):staged(c));requireAcceptedChain(result);
 const section=collections[c.features[0].section]!,feature:any=(result.ir.creature as any)[section][0];
 const item=result.actor.items.find((item:any)=>normalize(item.system.description.value).includes(normalize(c.features[0].text))),activity:any=Object.values(item.system.activities)[0];
 assert.equal(activity.type,'heal');assert.equal(feature.healing.formula,id.includes('psychic')?'1d10':'2d10+5');assert.equal(feature.healing.type,id.includes('psychic')?'healing':'temphp');
 assert.equal(activity.target.affects.type,id.includes('psychic')?'self':'creature');assert.equal(String(activity.target.affects.count),'1');assert.equal(activity.target.affects.special,feature.healing.target.special);
 if(id.includes('war-cry')){assert.equal(item.type,'feat');assert.equal(Object.hasOwn(item.system,'range'),false);assert.equal(activity.target.affects.special,'The giant or one creature of its choice that can see or hear it');assert.equal(activity.range.units,'spec');assert.equal(activity.range.special,feature.healing.target.special);}
 assert.equal(result.ir.creature.traits.length,0);assert.deepEqual(item.effects,[]);
 for(const mutate of [
  (a:any)=>{a.healing.types=[feature.healing.type==='healing'?'temphp':'healing'];},
  (a:any)=>{a.healing.number=99;},
  (a:any)=>{a.target.affects.type=id.includes('psychic')?'creature':'self';},
  (a:any)=>{a.target.affects.special='one creature';},
 ]){const actor=structuredClone(result.actor),changed=actor.items[result.actor.items.indexOf(item)];mutate(Object.values(changed.system.activities)[0]);const findings=verifyMonsterIntake(c.source,result.ir,result.markdown,actor,request(c.source).candidate).findings;assert.equal(findings.some(f=>f.code==='ACTOR_HEALING_DRIFT'||f.code==='ACTOR_HEALING_TARGET_DRIFT'),true);}
});


test('round5 inline trait detection stops at reactions or legendary actions before companion actions',()=>{
 for(const id of ['r14m-srd52-aboleth-psychic-drain','r14m-srd52-nalfeshnee-pursuit']){
  const c:any=structuredClone(iterate50Round5.cases.find(c=>c.id===id));assert.equal(c.source.includes('\nTraits\n'),false);
  const ir=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));
  assert.equal(validateMonsterIntakeIR(c.source,ir).blocking.some(f=>f.code==='MISSING_SOURCE_FEATURES'&&f.path==='/creature/traits'),false);
  ir.creature.actions=[];assert.equal(validateMonsterIntakeIR(c.source,ir).blocking.some(f=>f.code==='MISSING_SOURCE_FEATURES'&&f.path==='/creature/actions'),true);
 }
 const c=get('hydra-head-count-state');c.units=c.units.filter((u:any)=>u.destination!=='context');c.units.push({destination:'context',section:'action',text:'Actions\n'});c.source=c.units.map((u:any)=>u.text).join('');const ir=raw(c);ir.creature.traits=[];
 assert.equal(validateMonsterIntakeIR(c.source,ir).blocking.some(f=>f.code==='MISSING_SOURCE_FEATURES'&&f.path==='/creature/traits'),true);
});

test('round5 fixed healing consumes the complete quantity clause instead of truncating a multiplier or cap',()=>{
 for(const suffix of ['for each creature it has grappled.','per spell level.','up to a maximum of 20 hit points.','multiplied by the number of targets.','or half as many on a success.','. This amount is doubled while bloodied.']){
  const text='Renewal. Sentinel regains 5 hit points '+suffix;assert.equal(sourceFixedHealing(text,'Renewal','Sentinel'),undefined);
  const source=r5Source(text),plan=splitStagedMonsterSource(request(source)),unit=plan.features[0]!,feature=assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}},'Sentinel');assert.equal(feature.executionMode,'gm-manual');assert.equal(feature.healing,undefined);assert.equal(feature.description,text);
  assert.equal(mixedFeatureSourceMatches({name:'Renewal',description:text,activityType:'heal',executionMode:'native-with-gm',nativeRuleText:text,manualRemainder:text,healing:{formula:'5',type:'healing',target:{type:'self',count:1,special:'Sentinel'}}},'traits','Sentinel'),false);
 }
 for(const text of ['Renewal. Sentinel regains 5 hit points.','Renewal. Sentinel regains 5 hit points','Renewal. Sentinel regains 5 hit points, and has Advantage on saving throws until the end of its next turn.'])assert.equal(sourceFixedHealing(text,'Renewal','Sentinel')?.formula,'5');
 for(const s of r5HealingSources)assert.deepEqual(sourceFixedHealing(s.text,s.name,s.actor),{formula:s.formula,type:s.type,target:s.target});
 const source='Renewal. Healing is doubled. Sentinel regains 5 hit points.';assert.equal(sourceFixedHealing(source,'Renewal','Sentinel'),undefined);
});


test('round5 ordinary and staged legacy fixed Heal cannot flatten an unresolved quantity suffix',()=>{
 for(const suffix of ['for each creature it has grappled.','per spell level.']){
  const c=get('hydra-head-count-state'),f=c.features[0],text='Renewal. Sentinel regains 5 hit points '+suffix;f.name='Renewal';f.text=text;f.operations=[];
  for(const u of c.units)if(u.destination==='feature'){u.name='Renewal';u.text=text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');
  const good=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));assert.deepEqual(validateMonsterIntakeIR(c.source,good).blocking,[]);
  for(const mode of [undefined,'native-with-gm']){
   const wrong=structuredClone(good),feature:any=wrong.creature.traits[0];Object.assign(feature,{activityType:'heal',healing:{formula:'5',type:'healing'}});
   if(mode){feature.executionMode=mode;feature.nativeRuleText=text;feature.manualRemainder=text;}else delete feature.executionMode;
   assert.equal(validateMonsterIntakeIR(c.source,wrong).blocking.some(f=>f.code==='SOURCE_HEALING_AMOUNT_UNPROVEN'),true);
  }
  const plan=splitStagedMonsterSource(request(c.source)),unit=plan.features[0]!,manual=assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}},'Sentinel');assert.equal(manual.executionMode,'gm-manual');assert.equal(manual.healing,undefined);
  assert.throws(()=>assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'native-with-gm',facts:{activityType:'heal',healing:{formula:'5',type:'healing'}}},'Sentinel'));
 }
});


// Round 6 intake repair: equipment titles and condition-bound fixed healing.
const r6HealingCases=()=>iterate50Round6.cases.flatMap(c=>c.features.filter((f:any)=>f.legacy?.healing).map(f=>({c:structuredClone(c),f:structuredClone(f)})));
test('round6 prices remain literal physical titles, with separate companion ownership and no counters',()=>{
 for(const id of ['r15r-alchemists-fire','r15r-manacles','r15r-climbers-kit','r15r-net','r15r-oil','r15r-hunting-trap']){
  const c:any=structuredClone(iterate50Round6.cases.find(c=>c.id===id));
  for(const source of [c.source,c.source.replace(/\n/gu,'\r\n')]){
   const plan=splitStagedMonsterSource(request(source));assert.deepEqual(plan.features.map(f=>f.name),c.features.map((f:any)=>f.name));
   for(const unit of plan.features)assert.equal(source.slice(unit.start,unit.end),unit.quote);
  }
  assert.deepEqual(sourceFeatureResources(c.features[0].name,c.features[0].text,c.creature.identity.name),{});
 }
 for(const title of ['Gear (5 Uses)','Gear (1d4)','Weight Cost (5 GP)','Gear (5 GP) followed by body','gear (5 GP)'])assert.throws(()=>splitStagedMonsterSource(request(r5Source(title+'\nA creature waits.'))));
 const source=r5Source('Gear. The sentinel can use\nNet (1 GP)\nonly after its own turn.');assert.equal(splitStagedMonsterSource(request(source)).features.length,1);
});

test('round6 fixed healing proves local amount, full trigger and the one source recipient',()=>{
 for(const {c,f}of r6HealingCases()){
  const actor=c.creature.identity.name,healing=sourceFixedHealing(f.text,f.name,actor);assert.deepEqual(healing,(f as any).legacy.healing);
  const primary=stagedFeatureMechanics(f.text,f.name,actor);assert.equal(primary?.manualRemainder,f.text);
  assert.equal(primary?.facts.range,c.id.includes('unicorn')?60:undefined);
  const plan=splitStagedMonsterSource(request(c.source)),unit=plan.features.find(u=>u.name===f.name)!;
  const assembled=assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}},actor);
  assert.deepEqual(assembled.healing,healing);assert.equal(assembled.executionMode,'native-with-gm');assert.equal(assembled.manualRemainder,f.text);
  const section=collections[f.section]!,cost=f.section==='legendary'?1:undefined;
  assert.equal(mixedFeatureSourceMatches(assembled,section,actor,cost),true);
  for(const bad of [{...healing,formula:'99'},{...healing,type:healing!.type==='healing'?'temphp':'healing'},{...healing,target:{...healing!.target,type:healing!.target!.type==='self'?'creature':'self'}},{...healing,target:{...healing!.target,special:'one creature'}}])assert.equal(mixedFeatureSourceMatches({...assembled,healing:bad} as any,section,actor,cost),false);
  assert.equal(assembled.appliedConditions,undefined);assert.equal(assembled.spellUseRecords,undefined);
 }
});

test('round6 selection range is restored only from its adjacent same-source single recipient',()=>{
 const {c,f}=r6HealingCases().find(({c})=>c.id.includes('unicorn'))!,ir=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));
 const feature:any=ir.creature.legendaryActions[0];assert.equal(feature.range,60);
 const parsed=new StructuredActionParser().parseStructuredSection([{名称:f.name,类型:'heal',范围:'60 尺',治疗:{公式:feature.healing.formula,类型:feature.healing.type,target:feature.healing.target}}],'legendaryActions')[0]!;
 const activity:any=Object.values(new ActivityGenerator({fvttVersion:'14'}).generate(structuredActionToActivityData(parsed)))[0];assert.deepEqual(activity.range,{value:60,units:'ft',special:'',override:false});assert.equal(activity.target.affects.type,'creature');assert.equal(activity.target.affects.special,feature.healing.target.special);
 const plan=splitStagedMonsterSource(request(c.source)),unit=plan.features.find(u=>u.name===f.name)!;assert.equal(assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}},c.creature.identity.name).range,60);
 for(const changed of [f.text.replace('The unicorn targets','The target targets'),f.text.replace('one creature','two creatures'),f.text.replace('of itself.','of an ally.'),f.text.replace('The target gains','The unicorn looks away. The target gains')])assert.equal(sourceFixedHealing(changed,f.name,c.creature.identity.name),undefined);
 const wrong=structuredClone(ir);wrong.creature.legendaryActions[0]!.range=90;assert.equal(validateMonsterIntakeIR(c.source,wrong).blocking.some(f=>f.code==='MIXED_FEATURE_SOURCE_CONFLICT'),true);
 const war=r5HealingSources.find(s=>s.name.startsWith('War Cry'))!;assert.equal(stagedFeatureMechanics(war.text,war.name,war.actor)?.facts.range,undefined);
});

test('round6 conditional fixed amounts cannot become per-target, per-level or limited scaled heals in old IR',()=>{
 const source='Growth. At the end of its turn, the sentinel grows two heads for each dead head. The sentinel regains 20 Hit Points when it grows new heads.';
 assert.equal(sourceFixedHealing(source,'Growth','Sentinel')?.formula,'20');
 for(const text of [source.replace('when it grows new heads','for each new head it grows'),'Renewal. Sentinel regains 5 hit points per spell level.','Renewal. Sentinel regains 5 hit points up to a maximum of 20.','Renewal. Sentinel regains 5 hit points. This amount depends on the number of targets.','Renewal. Sentinel regains 5 hit points. These Hit Points are twice your level.','Renewal. Sentinel regains 5 hit points. Twice as many Hit Points are recovered.']){
  const name=text.split('.')[0]!,c=get('hydra-head-count-state'),f=c.features[0];f.name=name;f.text=text;f.operations=[];
  for(const u of c.units)if(u.destination==='feature'){u.name=name;u.text=text+'\n';}c.source=c.units.map((u:any)=>u.text).join('');
  assert.equal(sourceFixedHealing(text,name,'Sentinel'),undefined);
  const good=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));assert.deepEqual(validateMonsterIntakeIR(c.source,good).blocking,[]);
  for(const mode of [undefined,'native-with-gm']){const wrong=structuredClone(good),feature:any=wrong.creature.traits[0];Object.assign(feature,{activityType:'heal',healing:{formula:'5',type:'healing'}});if(mode){feature.executionMode=mode;feature.nativeRuleText=text;feature.manualRemainder=text;}else delete feature.executionMode;assert.equal(validateMonsterIntakeIR(c.source,wrong).blocking.some(f=>f.code==='SOURCE_HEALING_AMOUNT_UNPROVEN'),true);}
 }
 for(const s of r5HealingSources)assert.deepEqual(sourceFixedHealing(s.text,s.name,s.actor),{formula:s.formula,type:s.type,target:s.target});
});


// Round 7 intake repair: source-owned sensory qualifiers and Action headings.
test('round7 range qualifiers keep complete source conditions while proving only the Actor distance',()=>{
 for(const id of ['r16m-srd52-sprite-heart-sight','r16m-srd52-sea-hag-vile-appearance','r16m-srd52-chain-devil-unnerving-gaze']){
  const c:any=structuredClone(iterate50Round7.cases.find(c=>c.id===id)),f=c.features[0],ops=bindSourceOperations(f.text,f.operations);
  const feature:any={name:f.name,description:f.text,activityType:'utility',executionMode:'native-with-gm',nativeRuleText:f.text,manualRemainder:f.text,sourceOperations:ops};
  assert.deepEqual(sourceOperationFeatureErrors(feature,c.creature.identity.name),[]);
  assert.equal(ops[0]!.range,id.includes('sprite')?5:30);assert.equal(ops[0]!.condition,f.text);assert.equal(ops[0]!.sourceText,f.text);assert.equal(ops[0]!.proof.range,f.operations[0].proof.range);assert.equal(ops[0]!.targetSpecial,f.operations[0].targetSpecial);
  if(id.includes('sprite'))assert.equal(ops[0]!.targetSpecial?.includes('Celestials, Fiends, and Undead automatically fail'),true);
  if(id.includes('sea-hag'))assert.equal(ops[0]!.targetSpecial?.includes('Beast or Humanoid that starts its turn'),true);
  if(id.includes('chain-devil'))assert.equal(ops[0]!.condition?.includes('the devil can see starts its turn within 30 feet of the devil and can see the devil'),true);
 }
});

test('round7 sensory origins cannot borrow another centre, arbitrary name prefix or a negated distance',()=>{
 for(const [actor,quote,distance]of [
  ['Sprite','One creature within 5 feet the sprite can see.',5],
  ['Ancient Black Dragon','One creature within 5 feet the black dragon can hear.',5],
  ['Sphinx of Lore','One creature within 5 feet the sphinx cannot see.',5],
  ['Sea Hag','Any creature within 30 feet of the hag and can see its true form.',30],
  ['Chain Devil','A creature within 30 feet of the devil and cannot see the devil.',30],
 ] as const)assert.deepEqual(r5RangeErrors('Sight. '+quote,quote,distance,actor),[]);
 for(const [actor,quote,distance]of [
  ['Sprite','One creature within 5 feet the target can see.',5],
  ['Dragon Summoner','One creature within 5 feet the dragon can see.',5],
  ['Sea Hag','Any creature within 30 feet of a flash and can see the hag.',30],
  ['Sea Hag','Any creature within 30 feet of an ally and can see the hag.',30],
  ['Sea Hag','Any creature within 30 feet of the hag and the target.',30],
  ['Sea Hag','Any creature within 30 feet of the hag or can see the hag.',30],
  ['Sprite','One creature not within 5 feet of the sprite.',5],
  ['Sprite','One creature never within 5 feet the sprite can see.',5],
 ] as const)assert.equal(r5RangeErrors('Sight. '+quote,quote,distance,actor).length,1);
 const q='One creature within 20 feet of Sentinel that it can see.';assert.deepEqual(r5RangeErrors('Sight. '+q,q,20),[]);
});

test('round7 closed Action headings preserve all three complete companion parents and reject fake boundaries',()=>{
 const c:any=structuredClone(iterate50Round7.cases.find(c=>c.id==='r16r-supreme-sneak'));
 for(const source of [c.source,c.source.replace(/\n/gu,'\r\n')]){const plan=splitStagedMonsterSource(request(source));assert.deepEqual(plan.features.map(f=>f.name),c.features.map((f:any)=>f.name));for(const unit of plan.features)assert.equal(source.slice(unit.start,unit.end),unit.quote);}
 const ir=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));assert.deepEqual(validateMonsterIntakeIR(c.source,ir).blocking,[]);
 for(const [index,f]of ir.creature.traits.entries())assert.equal(completeSourceFeatureEvidence(c.source,ir,f,'/creature/traits/'+index)?.quote.trim(),c.features[index].text);
 const merged=structuredClone(ir);merged.creature.traits[0]!.description+=' '+merged.creature.traits[1]!.description;assert.equal(completeSourceFeatureEvidence(c.source,merged,merged.creature.traits[0]!,'/creature/traits/0'),undefined);
 for(const name of ['Hide [Action]','Attack [Action]','Disengage [Action]'])assert.equal(splitStagedMonsterSource(request(r5Source(name+'\nThe source rule stays complete.'))).features[0]!.name,name);
 for(const name of ['Hide [Anything]','Hide [Ability]','Strength Dexterity Constitution [Action]','Saving Throws [Action]','Hide [Action] followed by body'])assert.throws(()=>splitStagedMonsterSource(request(r5Source(name+'\nThe source rule stays complete.'))));
 const continuation=r5Source('Rule. The sentinel can use\nHide [Action]\nonly after its own turn.');assert.equal(splitStagedMonsterSource(request(continuation)).features.length,1);
});


test('round7 sensory range fixes do not waive the remote area placement field',()=>{
 for(const [id,distance]of [['r16r-ball-bearings',10],['r16r-caltrops',5]] as const){
  const c:any=structuredClone(iterate50Round7.cases.find(c=>c.id===id)),f=c.features[0],ops=structuredClone(f.operations),area=ops.find((op:any)=>op.aoe);
  area.range=distance;area.proof.range=area.proof.aoe;
  const feature:any={name:f.name,description:f.text,activityType:'utility',executionMode:'native-with-gm',nativeRuleText:f.text,manualRemainder:f.text,sourceOperations:ops};
  assert.deepEqual(sourceOperationFeatureErrors(feature,c.creature.identity.name),[]);
  delete area.range;delete area.proof.range;
  assert.equal(sourceOperationFeatureErrors(feature,c.creature.identity.name).some(error=>error.field.includes('/range')&&error.message.includes('remote area')),true);
 }
});


// Round 8 intake repair: lowercase function words in exact physical titles.
const r8LinePartition=(c:any)=>{let at=0;return{schemaVersion:1,units:c.units.map((u:any)=>{const n=u.text.split(/\r\n|\n|\r/u).length-1,row={firstLine:at,lastLine:at+n-1,destination:u.destination,...(u.section?{section:u.section}:{}),...(u.name?{name:u.name}:{})};at+=n;return row;})};};
test('round8 exact source title with a lowercase preposition keeps both source partition consumers complete',()=>{
 const c:any=structuredClone(iterate50Round8.cases.find(c=>c.id==='r17r-moving-around-other-creatures'));
 for(const source of [c.source,c.source.replace(/\n/gu,'\r\n')]){
  const variant=structuredClone(c);variant.source=source;if(source.includes('\r\n')){for(const unit of variant.units)unit.text=unit.text.replace(/\n/gu,'\r\n');for(const feature of variant.features)feature.text=feature.text.replace(/\n/gu,'\r\n');}
  const req=request(source),ir=anchorIrEvidence(source,req.candidate,raw(variant));assert.deepEqual(validateMonsterIntakeIR(source,ir).blocking,[]);
  for(const plan of [splitStagedMonsterSource(req),assembleStagedLinePartition(req,r8LinePartition(variant))]){assert.equal(plan.features.length,1);assert.equal(plan.features[0]!.name,'Moving around Other Creatures');assert.equal(plan.features[0]!.quote.trim(),variant.features[0].text);}
  const f=ir.creature.traits[0]!;assert.equal(f.executionMode,'gm-manual');assert.equal(f.appliedConditions,undefined);assert.equal(completeSourceFeatureEvidence(source,ir,f,'/creature/traits/0')?.quote.trim(),source.slice(source.indexOf(c.features[0].name)).trim());
  const clipped=structuredClone(ir);clipped.creature.traits[0]!.description=clipped.creature.traits[0]!.description.replace('unless that creature is Tiny or your ally','');assert.equal(validateMonsterIntakeIR(source,clipped).blocking.some(f=>f.code==='MANUAL_FEATURE_INCOMPLETE_SOURCE'),true);
 }
 const wrong=r8LinePartition(c);wrong.units[2].name='Moving around Other creatures';assert.throws(()=>assembleStagedLinePartition(request(c.source),wrong));
});

test('round8 title function words use full token and case boundaries without promoting prose, stats or continuation',()=>{
 for(const name of ['Moving around Other Creatures','Passing through Occupied Spaces','Standing between Allied Creatures','Sheltering behind Stone Walls','Moving AROUND Other Creatures']){
  const source=r5Source(name+'\nThe sentinel waits for the GM.');assert.equal(splitStagedMonsterSource(request(source)).features[0]!.name,name);
 }
 for(const name of ['around Other Creatures','through Occupied Spaces','moving around Other Creatures','Moving around other creatures','Moving aroundness Other Creatures','Moving surrounded Other Creatures','Moving around Other Creatures can attack','Strength Dexterity Constitution','Languages around Common'])assert.throws(()=>splitStagedMonsterSource(request(r5Source(name+'\nThe sentinel waits for the GM.'))));
 const continuation=r5Source('Rule. The sentinel can use\nMoving around Other Creatures\nonly after its own turn.');const plan=splitStagedMonsterSource(request(continuation));assert.equal(plan.features.length,1);assert.equal(plan.features[0]!.name,'Rule');assert.equal(plan.features[0]!.quote.includes('Moving around Other Creatures'),true);
 const unchanged=r5Source('Steadfast. The sentinel stands firm.');assert.equal(splitStagedMonsterSource(request(unchanged)).features[0]!.name,'Steadfast');
});

// Round 9 intake repair: physical rule headings and literal legacy Attack totals.
test('round9 exact slash and single-word rule titles retain complete source in ordinary and both partition consumers',()=>{
 for(const id of ['r18r-speed','r18r-advantage-disadvantage']){
  const c:any=structuredClone(iterate50Round9.cases.find(c=>c.id===id));
  for(const crlf of [false,true]){
   const variant=structuredClone(c);if(crlf){variant.source=variant.source.replace(/\n/gu,'\r\n');for(const u of variant.units)u.text=u.text.replace(/\n/gu,'\r\n');for(const f of variant.features)f.text=f.text.replace(/\n/gu,'\r\n');}
   const req=request(variant.source),ir=anchorIrEvidence(variant.source,req.candidate,raw(variant));assert.deepEqual(validateMonsterIntakeIR(variant.source,ir).blocking,[]);
   for(const plan of [splitStagedMonsterSource(req),assembleStagedLinePartition(req,r8LinePartition(variant))]){assert.equal(plan.features.length,1);assert.equal(plan.features[0]!.name,c.features[0].name);assert.equal(plan.features[0]!.quote.trim(),variant.features[0].text);}
   assert.equal(completeSourceFeatureEvidence(variant.source,ir,ir.creature.traits[0]!,'/creature/traits/0')?.quote.trim(),variant.features[0].text);
   const clipped=structuredClone(ir);clipped.creature.traits[0]!.description=clipped.creature.traits[0]!.description.replace(c.omission,'');assert.equal(validateMonsterIntakeIR(variant.source,clipped).blocking.some(f=>f.code==='MANUAL_FEATURE_INCOMPLETE_SOURCE'),true);
  }
 }
});
test('round9 slash and short headings preserve metadata, token, source-name and continuation boundaries',()=>{
 for(const [title,body] of [['Advantage/Disadvantage','A creature rolls two dice.'],['Rest/Recovery','A creature can rest here.'],['Attack/Defense Options','The sentinel can choose either rule.'],['Speed','A creature has a Speed, which defines how far it can move.'],['Initiative','A creature rolls Initiative before combat.']]){
  const source=r5Source(title+'\n'+body);assert.equal(splitStagedMonsterSource(request(source)).features[0]!.name,title);
 }
 for(const [title,body] of [['Speed 30 ft.','The sentinel waits.'],['Speed: 30 ft.','The sentinel waits.'],['Speed','30 ft., Fly 40 ft.'],['Speed','Walk Fly Burrow'],['AC','15'],['Strength Dexterity Constitution','14 10 16'],['Advantage/disadvantage','A creature rolls two dice.'],['Advantage//Disadvantage','A creature rolls two dice.'],['/Advantage','A creature rolls two dice.'],['Advantage/','A creature rolls two dice.'],['Advantage/Disadvantage can apply','A creature rolls two dice.']])assert.throws(()=>splitStagedMonsterSource(request(r5Source(title+'\n'+body))));
 const continuation=r5Source('Rule. The sentinel can use\nAdvantage/Disadvantage\nonly on its turn.');const plan=splitStagedMonsterSource(request(continuation));assert.equal(plan.features.length,1);assert.equal(plan.features[0]!.name,'Rule');assert.equal(plan.features[0]!.quote.includes('Advantage/Disadvantage'),true);
 const c:any=structuredClone(iterate50Round9.cases.find(c=>c.id==='r18r-advantage-disadvantage')),partition=r8LinePartition(c);partition.units[2].name='Advantage Disadvantage';assert.throws(()=>assembleStagedLinePartition(request(c.source),partition));
 assert.equal(splitStagedMonsterSource(request(r5Source('Steadfast. The sentinel stands firm.'))).features[0]!.name,'Steadfast');
});
test('round9 source-bound legacy Attack stays literal through IR Markdown workflow without inventing Constitution',async()=>{
 const c:any=structuredClone(iterate50Round9.cases.find(c=>c.id==='r18m-srd52-manticore-multiattack')),r=await chain(c,()=>staged(c));requireAcceptedChain(r);
 const attacks=r.ir.creature.actions.filter(f=>f.attack);assert.equal(attacks.length,2);assert.equal(attacks.every(f=>!f.sourceOperations),true);
 for(const [name,type,range,long] of [['Rend','slashing',5,undefined],['Tail Spike','piercing',100,200]] as const){
  const item=r.actor.items.find((i:any)=>i.name===name),activity:any=Object.values(item.system.activities)[0];
  assert.deepEqual(activity.attack,{ability:'',bonus:'5',flat:true,type:{value:name==='Rend'?'melee':'ranged',classification:'weapon'}});assert.equal(activity.flags?.fvttJsonGenerator?.sourceOperation,undefined);
  assert.deepEqual(activity.damage.parts.map((p:any)=>[p.number,p.denomination,p.bonus,p.types]),[[1,8,'3',[type]]]);assert.equal(item.system.damage?.base,undefined);
  assert.equal(name==='Rend'?activity.range.reach:activity.range.value,range);if(long!==undefined)assert.equal(activity.range.long,long);
  assert.equal(normalize(item.system.description.value).includes(normalize(c.features.find((f:any)=>f.name===name).text)),true);
 }
 // Without the existing Intake literal boundary this is CLI structured input; its
 // ability inference remains intact; the Intake fix must not change that path.
 const data=yaml.load(r.markdown.replace(/^---\r?\n/u,'').replace(/\r?\n---\s*$/u,'')) as Record<string,unknown>;delete data['intake-biography-mode'];delete data['intake-biography-presentation'];const oldMarkdown='---\n'+yaml.dump(data)+'---\n';assert.notEqual(oldMarkdown,r.markdown);
 const old=await convertMarkdownContentToJson({content:oldMarkdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
 for(const name of ['Rend','Tail Spike']){const item:any=(old.rawJson as any).items.find((i:any)=>i.name===name),activity:any=Object.values(item.system.activities)[0];assert.equal(activity.attack.ability,'con');assert.equal(activity.attack.flat,false);assert.equal(item.system.damage.base.number,1);assert.equal(item.system.damage.base.denomination,8);}
});
test('round9 disabling numeric inference preserves an explicitly supplied attack ability',()=>{
 const action:any={name:'Explicit attack',type:'attack',attack:{type:'mwak',ability:'str',toHit:4,range:'5 ft.',damage:[{formula:'1d8+2',type:'slashing'}]}},generator=new ActivityGenerator({fvttVersion:'14'});
 const activity:any=Object.values(generator.generate(action,{preferNativeWeaponRolls:false,abilities:{str:14,con:16},proficiencyBonus:2}))[0];assert.equal(activity.attack.ability,'str');assert.equal(activity.attack.flat,false);assert.equal(activity.attack.bonus,'');assert.deepEqual(activity.damage.parts.map((p:any)=>[p.number,p.denomination,p.bonus,p.types]),[[1,8,'2',['slashing']]]);
});

// Round 10 Intake header range consumer; full OP/area scope is checked separately.
const r10MetadataCarrier=(c:any):any=>{const f=c.features[0];return{name:f.name,description:f.text,activityType:'utility',executionMode:'native-with-gm',nativeRuleText:f.text,manualRemainder:f.text,sourceOperations:materializeSourceOperationEvidence(f.text,structuredClone(f.operations))};};
const r10ActorRangeErrors=(f:any,actor='Sentinel')=>sourceOperationFeatureErrors(f,actor).filter(e=>e.message.startsWith('An Actor range'));
test('round10 complete spell metadata range reaches the Intake carrier without changing its exact proof',()=>{
 for(const id of ['r19r-befuddlement','r19r-chromatic-orb','r19r-conjure-celestial','r19r-earthquake','r19r-freezing-sphere','r19r-dissonant-whispers']){
  const c:any=structuredClone(iterate50Round10.cases.find(c=>c.id===id)),feature=r10MetadataCarrier(c),before=JSON.stringify(feature);assert.deepEqual(r10ActorRangeErrors(feature,c.creature.identity.name),[]);assert.equal(JSON.stringify(feature),before);
 }
});
test('round10 carrier metadata fallback rejects altered, partial, foreign and later Range proofs',()=>{
 const c:any=structuredClone(iterate50Round10.cases.find(c=>c.id==='r19r-befuddlement')),good=r10MetadataCarrier(c),q=good.sourceOperations[0].proof.range;
 for(const edit of [
  (f:any)=>f.sourceOperations[0].range=151,
  (f:any)=>f.sourceOperations[0].proof.range=q.replace('Range: 150 feet','Range: 151 feet'),
  (f:any)=>f.sourceOperations[0].proof.range='Range: 150 feet',
  (f:any)=>f.sourceOperations[0].proof.range='The target is within 150 feet of a flash.',
  (f:any)=>f.sourceOperations[0].proof.range='One creature not within 150 feet of Sentinel.',
  (f:any)=>{const later='Arrow Transport. Range: 600 feet, then the target can travel.';f.description+=' '+later;f.nativeRuleText=f.description;f.manualRemainder=f.description;f.sourceOperations[0].range=600;f.sourceOperations[0].proof.range=later;},
  (f:any)=>{f.description='Other Spell. Level 1 Evocation (Wizard) Casting Time: Action Range: 60 feet Components: V Duration: Instantaneous You choose a target. '+f.description;f.nativeRuleText=f.description;f.manualRemainder=f.description;},
 ]){const altered=structuredClone(good);edit(altered);assert.equal(r10ActorRangeErrors(altered).length,1);}
});

test('round10 creation-only spell distance cannot be attached to the explosion calculator',()=>{
 const c:any=structuredClone(iterate50Round10.cases.find(c=>c.id==='r19r-delayed-blast-fireball')),f=r10MetadataCarrier(c);assert.equal(f.sourceOperations.length,1);assert.equal(f.sourceOperations[0].range,undefined);assert.deepEqual(r10ActorRangeErrors(f),[]);
 f.sourceOperations[0].range=150;f.sourceOperations[0].proof.range=sourceOperationClauses(f.description)[0];assert.equal(r10ActorRangeErrors(f).length,1);
});

// Round 10 explicit native range: pure saved/source IR -> Markdown -> workflow.
const r10RangeNote='GM 按原文目标或效应位置确定范围。';
async function r10RangeProjection(c:any){
 const ir=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));
 for(const collection of Object.values(collections))for(const f of (ir.creature as any)[collection]??[])if(f.sourceOperations)f.sourceOperations=bindSourceOperations(f.description,f.sourceOperations,f.evidence[0].start);
 const markdown=renderMonsterIntakeMarkdown(ir),out=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null}),actor:any=out.rawJson;
 assert.deepEqual(verifyMonsterIntake(c.source,ir,markdown,actor).findings.filter(f=>f.blocking),[]);
 return{c,ir,markdown,actor};
}
const r10RangeFindings=(r:any,actor:any)=>verifyMonsterIntake(r.c.source,r.ir,r.markdown,actor).findings.filter(f=>f.code==='ACTOR_SOURCE_OPERATION_RANGE_DRIFT');
test('round10 unknown target range stays special and independently rejects missing Self or invented feet',async()=>{
 for(const [corpus,id]of [[iterate50Round9,'r18r-energy-bow'],[iterate50Round10,'r19r-contagion']] as const){
  const c:any=structuredClone(corpus.cases.find(c=>c.id===id)),r=await r10RangeProjection(c),index=r.actor.items.findIndex((i:any)=>Object.values(i.system.activities).some((a:any)=>a.flags?.fvttJsonGenerator?.sourceOperation));assert.ok(index>=0);
  const item=r.actor.items[index],idOf=Object.keys(item.system.activities)[0]!,activity=item.system.activities[idOf];assert.deepEqual(activity.range,{override:true,units:'spec',special:r10RangeNote});assert.ok(activity.range.special.length<40);assert.equal(item.system.range,undefined);
  for(const edit of [(a:any)=>delete a.range,(a:any)=>a.range={override:true,units:'self',special:''},(a:any)=>a.range={override:true,units:'ft',value:60,special:''},(a:any)=>a.range.override=false,(a:any)=>a.range.special='']){const bad=structuredClone(r.actor);edit(bad.items[index].system.activities[idOf]);assert.ok(r10RangeFindings(r,bad).length>0);}
  const badTarget=structuredClone(r.actor);badTarget.items[index].system.activities[idOf].target.affects.special='';assert.ok(verifyMonsterIntake(c.source,r.ir,r.markdown,badTarget).findings.some(f=>f.code==='ACTOR_SOURCE_OPERATION_TARGET_DRIFT'));
 }
});
test('round10 known Self preserves old omitted native range but not a foreign inherited Item range',async()=>{
 const c:any=structuredClone(iterate50Round10.cases.find(c=>c.id==='r19r-relentless-rage')),r=await r10RangeProjection(c),item=r.actor.items[0],id=Object.keys(item.system.activities)[0]!;assert.deepEqual(item.system.activities[id].range,{override:true,units:'self',special:''});
 const old=structuredClone(r.actor);delete old.items[0].system.activities[id].range;assert.deepEqual(r10RangeFindings(r,old),[]);
 const inherited=structuredClone(old);inherited.items[0].system.range={units:'ft',value:60};assert.ok(r10RangeFindings(r,inherited).length>0);
 const wrong=structuredClone(r.actor);wrong.items[0].system.activities[id].range={override:true,units:'spec',special:r10RangeNote};assert.ok(r10RangeFindings(r,wrong).length>0);
});
test('round10 own Emanation and first Save-header Cone retain Self while a nearby statue keeps a GM centre',async()=>{
 for(const [corpus,id]of [[iterate50Round8,'r17m-srd52-cloaker-moan'],[iterate50Round3,'r12m-srd52-tarrasque-thunderous-bellow']] as const){
  const c:any=structuredClone(corpus.cases.find(c=>c.id===id)),r=await r10RangeProjection(c),item=r.actor.items[0],key=Object.keys(item.system.activities)[0]!;assert.equal(item.system.activities[key].range.units,'self');const legacy=structuredClone(r.actor);delete legacy.items[0].system.activities[key].range;assert.deepEqual(r10RangeFindings(r,legacy),[]);
 }
 const c:any=structuredClone(iterate50Round8.cases.find(c=>c.id==='r17r-fire-casting-statue')),r=await r10RangeProjection(c),activities:any[]=Object.values(r.actor.items[0].system.activities);assert.deepEqual(activities.map(a=>Number(a.target.template.size)),[15,30,60,120]);for(const a of activities)assert.deepEqual(a.range,{override:true,units:'spec',special:r10RangeNote});
});
test('round10 bilingual display identity agrees between generation and verifier for a full English of-name Self centre',async()=>{
 let c:any=structuredClone(iterate50Round3.cases.find(c=>c.id==='r12m-srd52-sphinx-valor-roar'));c=JSON.parse(JSON.stringify(c).replace(/the sphinx\b/giu,'the Sphinx of Valor'));const english=c.creature.identity.name;c.creature.identity.englishName=english;c.creature.identity.name='英勇斯芬克斯';c.units[0].text=c.units[0].text.replace(english+' CR 2','英勇斯芬克斯 ('+english+') CR 2');c.source=c.units.map((u:any)=>u.text).join('');
 const r=await r10RangeProjection(c);assert.equal(r.actor.name,'英勇斯芬克斯 Sphinx of Valor');const activities:any[]=Object.values(r.actor.items[0].system.activities);assert.equal(activities.length,3);assert.ok(activities.every(a=>a.range.units==='self'));assert.ok(c.features[0].text.includes('originating from the Sphinx of Valor'));
});

test('round10 external area placement uses shared initial or real existing-effect proof without accepting omitted or borrowed range',()=>{
 for(const id of ['r19r-conjure-celestial','r19r-delayed-blast-fireball','r19r-earthquake','r19r-freezing-sphere']){
  const c:any=structuredClone(iterate50Round10.cases.find(c=>c.id===id)),f=r10MetadataCarrier(c);assert.deepEqual(sourceOperationFeatureErrors(f,c.creature.identity.name),[],id);assert.equal(mixedFeatureSourceMatches(f,'traits',c.creature.identity.name),true);
  const initial=f.sourceOperations.find((o:any)=>o.range!==undefined);
  if(initial){
   const missing=structuredClone(f);delete missing.sourceOperations[0].range;delete missing.sourceOperations[0].proof.range;assert.ok(sourceOperationFeatureErrors(missing,c.creature.identity.name).some(e=>e.field.endsWith('/range'))&&!mixedFeatureSourceMatches(missing,'traits',c.creature.identity.name));
   const borrowed=structuredClone(f);borrowed.sourceOperations[1].range=initial.range;borrowed.sourceOperations[1].proof.range=initial.proof.range;assert.ok(sourceOperationFeatureErrors(borrowed,c.creature.identity.name).some(e=>e.field.endsWith('/range')));assert.equal(mixedFeatureSourceMatches(borrowed,'traits',c.creature.identity.name),false);
  }else{assert.equal(id,'r19r-delayed-blast-fireball');assert.equal(f.sourceOperations.length,1);const wrong=structuredClone(f);wrong.sourceOperations[0].range=150;wrong.sourceOperations[0].proof.range=sourceOperationClauses(f.description)[0];assert.ok(sourceOperationFeatureErrors(wrong,c.creature.identity.name).some(e=>e.field.endsWith('/range')));}
  const duplicate=structuredClone(f);duplicate.sourceOperations.push({...structuredClone(duplicate.sourceOperations.at(-1)),id:'extra-copy'});assert.equal(mixedFeatureSourceMatches(duplicate,'traits',c.creature.identity.name),false);
 }
});


// Round 11 source-owned fixed healing: full qualifications and base spell amounts.
const r11HealingCases=()=>iterate50Round11.cases.filter(c=>['r20r-periapt-of-health','r20r-aura-of-life','r20r-heal'].includes(c.id));
test('round11 fixed healing retains the complete wearer trigger, ally eligibility and seen single recipient',()=>{
 for(const original of r11HealingCases()){
  const c:any=structuredClone(original),f=c.features[0],expected=structuredClone(f.legacy.healing);expected.formula=expected.formula.replace(/\s+/gu,'');
  assert.deepEqual(sourceFixedHealing(f.text,f.name,c.creature.identity.name),expected,c.id);
  const primary=stagedFeatureMechanics(f.text,f.name,c.creature.identity.name);assert.equal(primary?.nativeRuleText,f.text);assert.equal(primary?.manualRemainder,f.text);assert.equal(primary?.facts.range,f.legacy.range);
  const plan=splitStagedMonsterSource(request(c.source)),unit=plan.features[0]!,assembled=assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}},c.creature.identity.name);
  assert.deepEqual(assembled.healing,expected);assert.equal(assembled.range,f.legacy.range);assert.equal(assembled.description,f.text);assert.equal(assembled.manualRemainder,f.text);assert.equal(assembled.appliedConditions,undefined);
  assert.equal(mixedFeatureSourceMatches(assembled,collections[f.section],c.creature.identity.name),true);
  const ordinaryIr=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));assert.deepEqual(validateMonsterIntakeIR(c.source,ordinaryIr).blocking,[]);
  for(const bad of [{...expected,formula:'99'},{...expected,type:'temphp'},{...expected,target:{...expected.target,type:expected.target.type==='self'?'creature':'self'}},{...expected,target:{...expected.target,count:2}},{...expected,target:{...expected.target,special:expected.target.type==='self'?'You':'one creature'}}])assert.equal(mixedFeatureSourceMatches({...assembled,healing:bad},collections[f.section],c.creature.identity.name),false);
  if(f.legacy.range!==undefined)assert.equal(mixedFeatureSourceMatches({...assembled,range:f.legacy.range+5},collections[f.section],c.creature.identity.name),false);
 }
});
test('round11 a fixed base spell heal does not flatten its higher-slot option or another quantity modifier',()=>{
 const c:any=structuredClone(r11HealingCases().find(c=>c.id==='r20r-heal')),f=c.features[0];
 assert.equal(sourceFixedHealing(f.text,f.name,'Sentinel')?.formula,'70');
 for(const source of [f.text.replace('restoring 70 Hit Points.','restoring 70 Hit Points per spell slot level.'),f.text.replace('The healing increases by 10 for each spell slot level above 6.','The healing is doubled.'),f.text.replace('The healing increases by 10 for each spell slot level above 6.','The healing increases by 10 for each spell slot level above 3.'),'Renewal. Sentinel regains 5 hit points for each creature it has grappled.','Renewal. Sentinel regains 5 hit points per spell level.','Renewal. Your Hit Point maximum and current Hit Points both increase by 2d10.'])assert.equal(sourceFixedHealing(source,source.startsWith('Renewal.')?'Renewal':f.name,'Sentinel'),undefined);
 const blessed:any=iterate50Round11.cases.find(c=>c.id==='r20r-blessed-healer');assert.equal(sourceFixedHealing(blessed.features[0].text,blessed.features[0].name,'Sentinel'),undefined);
});
test('round11 fixed healing cannot borrow another aura origin, receiver or spell selection',()=>{
 const aura:any=r11HealingCases().find(c=>c.id==='r20r-aura-of-life'),a=aura.features[0];
 for(const source of [a.text.replace('radiates from you','radiates from an ally'),a.text.replace('that ally regains','you regain'),a.text.replace('an ally with 0 Hit Points','two allies with 0 Hit Points'),a.text.replace('in the aura, that ally','near a statue, that ally')])assert.equal(sourceFixedHealing(source,a.name,'Sentinel'),undefined);
 const heal:any=r11HealingCases().find(c=>c.id==='r20r-heal'),h=heal.features[0];
 for(const source of [h.text.replace('Choose a creature','Choose two creatures'),h.text.replace('through the target, restoring','through an ally, restoring'),h.text.replace('Positive energy washes','Another creature moves. Positive energy washes')])assert.equal(sourceFixedHealing(source,h.name,'Sentinel'),undefined);
 const periapt:any=r11HealingCases().find(c=>c.id==='r20r-periapt-of-health'),p=periapt.features[0];
 for(const source of [p.text.replace('you can take','another creature can take'),p.text.replace('to regain','to let an ally regain'),p.text.replace('to regain','to never regain')])assert.equal(sourceFixedHealing(source,p.name,'Sentinel'),undefined);
});
test('round11 generic casting discussion stays manual in ordinary and staged consumers',()=>{
 for(const id of ['r20r-blessed-healer','r20r-casting-spells']){
  const c:any=structuredClone(iterate50Round11.cases.find(c=>c.id===id)),ir=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));assert.deepEqual(validateMonsterIntakeIR(c.source,ir).blocking,[]);
  const plan=splitStagedMonsterSource(request(c.source));assert.equal(stagedSpellcastingGroups(plan).size,0);
  const f=assembleStagedFeature(plan,plan.features[0]!,{schemaVersion:1,unitId:plan.features[0]!.id,mode:'manual',facts:{}},c.creature.identity.name);assert.equal(f.executionMode,'gm-manual');assert.equal(f.description,c.features[0].text);assert.equal(f.healing,undefined);assert.equal(f.spellUseRecords,undefined);
 }
});
test('round11 ordinary and staged counters belong only to the complete feature that declares them',()=>{
 for(const id of ['r20r-sorcery-incarnate','r20r-arcane-apotheosis','r20r-magical-cunning','r20r-periapt-of-health']){
  const c:any=structuredClone(iterate50Round11.cases.find(c=>c.id===id)),ir=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));assert.deepEqual(validateMonsterIntakeIR(c.source,ir).blocking,[]);
  const plan=splitStagedMonsterSource(request(c.source));
  for(const [index,unit]of plan.features.entries()){
   const f=assembleStagedFeature(plan,unit,{schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}},c.creature.identity.name);assert.deepEqual(f.uses,c.features[index].uses);assert.equal(f.description,c.features[index].text);
   const wrong=structuredClone(ir),feature=(wrong.creature as any)[collections[c.features[index].section]!].find((f:any)=>f.name===c.features[index].name);feature.uses={max:9,period:'day'};assert.ok(validateMonsterIntakeIR(c.source,wrong).blocking.some(f=>f.code==='MANUAL_RESOURCE_SOURCE_CONFLICT'||f.code==='MIXED_FEATURE_SOURCE_CONFLICT'));
  }
 }
});

test('round11 restoring quantity modifiers independently reject an explicit fixed legacy Heal',()=>{
 for(const suffix of ['per spell slot level','for each creature it affects','up to a maximum of 100']){
  const c:any=structuredClone(r11HealingCases().find(c=>c.id==='r20r-heal')),f=c.features[0];f.text=f.text.replace('restoring 70 Hit Points.','restoring 70 Hit Points '+suffix+'.');f.legacy.nativeRuleText=f.text;f.legacy.manualRemainder=f.text;
  const unit=c.units.find((u:any)=>u.destination==='feature');unit.text=f.text+'\n';c.source=c.units.map((u:any)=>u.text).join('');
  for(const mode of ['native-with-gm',undefined]){const ir=anchorIrEvidence(c.source,request(c.source).candidate,raw(c)),feature:any=ir.creature.traits[0];if(mode===undefined){delete feature.executionMode;delete feature.nativeRuleText;delete feature.manualRemainder;}assert.ok(validateMonsterIntakeIR(c.source,ir).blocking.some(f=>f.code==='SOURCE_HEALING_AMOUNT_UNPROVEN'));}
  delete f.legacy;const gm=anchorIrEvidence(c.source,request(c.source).candidate,raw(c));assert.deepEqual(validateMonsterIntakeIR(c.source,gm).blocking,[]);
  const plan=splitStagedMonsterSource(request(c.source)),manual=assembleStagedFeature(plan,plan.features[0]!,{schemaVersion:1,unitId:plan.features[0]!.id,mode:'manual',facts:{}},'Sentinel');assert.equal(manual.executionMode,'gm-manual');assert.equal(manual.healing,undefined);assert.equal(manual.description,f.text);
 }
});

test('round11 a self-origin range ends before the adjacent hit predicate without borrowing foreign origins',()=>{
 const c:any=structuredClone(iterate50Round11.cases.find(c=>c.id==='r20r-fire-shield')),f=c.features[0],ops=bindSourceOperations(f.text,f.operations);
 const carrier:any={name:f.name,description:f.text,activityType:'utility',executionMode:'native-with-gm',nativeRuleText:f.text,manualRemainder:f.text,sourceOperations:ops};
 assert.deepEqual(sourceOperationFeatureErrors(carrier,c.creature.identity.name),[]);assert.equal(mixedFeatureSourceMatches(carrier,'traits',c.creature.identity.name),true);assert.equal(ops[0]!.range,5);assert.equal(ops[0]!.proof.range,f.operations[0].proof.range);assert.equal(ops[0]!.targetSpecial,'whenever a creature within 5 feet of you hits you with a melee attack roll');
 for(const [actor,origin]of [['Sentinel','you'],['Sentinel','yourself'],['Sentinel','the sentinel'],['Ancient Black Dragon','the dragon']]){
  const quote=`In addition, whenever a creature within 5 feet of ${origin} hits you with a melee attack roll, the shield erupts with flame.`;assert.deepEqual(r5RangeErrors('Ward. '+quote,quote,5,actor),[]);assert.equal(r5RangeErrors('Ward. '+quote,quote,10,actor).length,1);
 }
 for(const [actor,origin]of [['Sentinel','a flash'],['Sentinel','the target'],['Sentinel','an ally'],['Dragon Summoner','the dragon']]){
  const quote=`In addition, whenever a creature within 5 feet of ${origin} hits you with a melee attack roll, the shield erupts with flame.`;assert.equal(r5RangeErrors('Ward. '+quote,quote,5,actor).length,1);
 }
 const negative='In addition, whenever a creature not within 5 feet of you hits you with a melee attack roll, the shield erupts with flame.';assert.equal(r5RangeErrors('Ward. '+negative,negative,5).length,1);
 const wrong=structuredClone(carrier);wrong.sourceOperations[0].range=10;assert.ok(sourceOperationFeatureErrors(wrong,c.creature.identity.name).some(e=>e.field.endsWith('/range')));
 const delayed:any=structuredClone(iterate50Round10.cases.find(c=>c.id==='r19r-delayed-blast-fireball')),creation=r10MetadataCarrier(delayed);creation.sourceOperations[0].range=150;creation.sourceOperations[0].proof.range=sourceOperationClauses(creation.description)[0];assert.equal(r10ActorRangeErrors(creation).length,1);
});
