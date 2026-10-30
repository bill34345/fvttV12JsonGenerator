import {test,expect} from 'bun:test';
import {runStagedMonsterExtraction} from '../packages/intake-ai/src/staged-extraction';
import {sourceOperationClauses} from '@fvtt-json-generator/models/source-operations';
import {sourceSharedUseDeclarations,sourceResourcePoolErrors} from '@fvtt-json-generator/models/source-resource-pools';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import recorded from './fixtures/cloaker-srd51-boundary.json';

const header=recorded.source.slice(0,recorded.source.indexOf('Damage Transfer.'));
const creature={identity:{name:'Cloaker',size:'large',creatureType:'aberration',alignment:'chaotic neutral'},abilities:{str:17,dex:15,con:12,int:13,wis:12,cha:14},attributes:{ac:14,acKind:'natural',hp:{value:78,formula:'12d10+12'},movement:{walk:10,fly:40},cr:8,xp:3900},saves:{},skills:{stealth:5},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{darkvision:60,passivePerception:11},languages:{values:['deep','undercommon']}};
const a='Cinder Stroke (3/Day). Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 3 (1d6) fire damage. Cinder Stroke and Frost Stroke share these three uses.';
const b='Frost Stroke (3/Day). Melee Spell Attack: +4 to hit, reach 30 ft., one target. Hit: 4 (1d8) cold damage. The target must make a DC 12 Constitution saving throw. Failure: The target is prone.';
const source=header+'Actions\n'+a+'\n'+b+'\n';
async function extract(options:{omit?:boolean;max?:number;cost?:number;member?:string;members?:number}={},input=source,end=input.length){
  const seen:any[]=[];
  const ir=await runStagedMonsterExtraction({source:input,sourceSha256:hashSource(input),candidate:{id:'shared',label:'Shared source',start:0,end,quote:input.slice(0,end)}},async call=>{
    await call.onAttempt(1);if(call.stage==='base')return{schemaVersion:1,creature,uncertainties:[]};
    seen.push(call.payload);const own=String(call.payload.source),clauses=sourceOperationClauses(own),first=own.startsWith('Cinder');
    const operations:any[]=[{id:'attack',name:'Attack',type:'attack',relationship:'primary',attack:first?{type:'mwak',toHit:5,reach:5,range:20,longRange:60}:{type:'msak',toHit:4,reach:30},damage:[{formula:first?'1d6':'1d8',type:first?'fire':'cold',relationship:'base'}],proof:{attack:clauses[1],damage:[clauses[2]]}}];
    if(!first)operations.push({id:'save',name:'Follow-up Save',type:'save',relationship:'follow-up',save:{dc:12,abilities:['con'],choice:'single',outcome:'none'},proof:{save:clauses[3]}});
    const inventory=call.payload.sourceInventory as Array<{id:string;name:string}>;
    return{schemaVersion:1,unitId:call.unitId,mode:'native-with-gm',facts:{sourceOperations:operations,...(first&&!options.omit?{sharedUses:{members:options.member?[inventory[0]!.id,options.member]:inventory.slice(0,options.members??inventory.length).map(feature=>feature.id),max:options.max??3,period:'day',cost:options.cost??1,quote:clauses[3]}}:{})}};
  },{baseMode:'facts',featureMode:'auto'});
  return{ir,seen};
}

test('explicit non-spell members share one native pool; both attack modes consume it and follow-up does not',async()=>{
  const {ir,seen}=await extract();expect(seen).toHaveLength(2);expect(ir.creature.sourceResourcePools).toHaveLength(1);
  expect(auditMonsterIntakeSource(source,ir).blocking).toEqual([]);
  const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(markdown)) as any;
  expect(verifyMonsterIntake(source,ir,markdown,actor).findings.filter(f=>f.blocking)).toEqual([]);
  const [first,second]=actor.items,primary=Object.values(first.system.activities) as any[],secondary=Object.values(second.system.activities) as any[];
  expect(first.system.uses).toEqual({spent:0,max:'3',recovery:[{period:'day',type:'recoverAll'}]});expect(second.system.uses?.max??'').toBe('');
  expect(primary).toHaveLength(2);expect(primary.every(activity=>activity.consumption.targets.length===1&&activity.consumption.targets[0].target===first._id&&activity.consumption.targets[0].value==='1')).toBe(true);
  expect(secondary.find(activity=>activity.type==='attack').consumption.targets).toEqual([{type:'itemUses',target:first._id,value:'1',scaling:{mode:'',formula:''}}]);expect(secondary.find(activity=>activity.type==='save').consumption.targets).toEqual([]);
  const forbidden=async():Promise<never>=>{throw Error('No external provider in shared-pool regression');};
  const result=await generateEncounterFromHumanMarkdown({source,label:'Shared uses',reviewPolicy:'deferred',outputLanguage:'source',drafts:[{key:'actor-1',source,ir}],draftParentHash:hashSource(JSON.stringify(ir)),provider:{providerName:'offline',extractionModel:'test',reviewModel:'test',discover:forbidden,extract:forbidden,repair:forbidden,review:forbidden},automationProvider:{generate:forbidden,review:forbidden}});
  expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
  const duplicate=structuredClone(actor);duplicate.items[1].system.uses=structuredClone(first.system.uses);expect(verifyMonsterIntake(source,ir,markdown,duplicate).status).toBe('needs_review');
  const double=structuredClone(actor),save=Object.values(double.items[1].system.activities).find((activity:any)=>activity.type==='save') as any;save.consumption.targets=[{type:'itemUses',target:first._id,value:'1'}];expect(verifyMonsterIntake(source,ir,markdown,double).status).toBe('needs_review');
});
for(const options of [{omit:true},{max:6},{cost:2},{member:'invented-unit'}])test('unknown or inconsistent shared pools fail closed: '+JSON.stringify(options),async()=>{await expect(extract(options)).rejects.toThrow();});
test('the sharing declaration count and daily modifier bind independently of member headings',async()=>{
  expect((await extract({},source.replace('three uses','3 daily uses'))).ir.creature.sourceResourcePools![0]!.max).toBe(3);
  await expect(extract({},source.replace('three uses','4 daily uses'))).rejects.toThrow('source-count');
});
for(const statement of ["Cinder Stroke and Frost Stroke don’t share these three uses.","Cinder Stroke and Frost Stroke can’t share these three uses.","Cinder Stroke and Frost Stroke share no uses."])test('negated sharing cannot manufacture a native pool: '+statement,async()=>{
  expect(sourceSharedUseDeclarations(statement)).toEqual([]);
  await expect(extract({},source.replace('Cinder Stroke and Frost Stroke share these three uses.',statement))).rejects.toThrow();
});
test('a separate member sentence declaring cost two cannot be hidden by a cost-one proposal',async()=>{
  await expect(extract({},source.replace('three uses.','three uses. Using Cinder Stroke costs 2 uses from this pool.'))).rejects.toThrow('unsupported-member-cost');
});
test('every explicitly named shared member must belong to the same pool',async()=>{
  const third=b.replaceAll('Frost Stroke','Thunder Stroke'),input=source.replace('Cinder Stroke and Frost Stroke share these three uses.','Cinder Stroke, Frost Stroke, and Thunder Stroke share these three daily uses.')+third+'\n';
  await expect(extract({members:2},input)).rejects.toThrow('source-members');
});
test('pool inventory and every evidence reference stay inside the current candidate',async()=>{
  const outside='Other A and Other B share these four daily uses.',input=source+'\nOther Monster\n'+outside+'\n',range={start:0,end:source.length};
  const {ir}=await extract({},input,range.end);expect(sourceResourcePoolErrors(input,ir.creature,hashSource(input),range)).toEqual([]);
  expect(auditMonsterIntakeSource(input,ir,{coverageRange:range}).blocking).toEqual([]);
  const changed=structuredClone(ir),start=input.indexOf(outside);changed.creature.sourceResourcePools![0]!.evidence.push({start,end:start+outside.length,quote:outside});
  expect(auditMonsterIntakeSource(input,changed,{coverageRange:range}).blocking.some(f=>f.code==='SOURCE_SHARED_RESOURCE_CONFLICT')).toBe(true);
});
