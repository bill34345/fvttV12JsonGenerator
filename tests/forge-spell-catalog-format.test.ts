import {describe, expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {normalizeMonsterIntakeProposal, OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {inlineDeclaredSpellCatalogs} from '../packages/intake-ai/src/spell-ref-identities';

const SOURCE='Citation only. This source deliberately contains no spell names, daily quotas or spell-list grammar.';
const evidence={start:0,end:SOURCE.length,quote:SOURCE};
const ref=(refId:string,name:string)=>({refId,identifier:name,originalName:name,englishName:name,chineseName:'AI原名 '+name,
  aliases:[name,'AI别名 '+name],restrictions:[{kind:'casting',text:'AI保留的完整施法限定',value:true,evidence:[{...evidence}]}],evidence:[{...evidence}]});

/** The model explicitly owns both the definitions and their local memberships. */
function catalogFixture():any{
  return {schemaVersion:1,source:{sha256:sha256(SOURCE),length:SOURCE.length},claims:[],coverage:[],uncertainties:[],creature:{
    identity:{name:'Catalog Fixture',size:'medium',creatureType:'humanoid'},abilities:{str:10,dex:12,con:14,int:18,wis:12,cha:10},
    attributes:{ac:15,hp:{value:81,formula:'18d8'},movement:{walk:30},cr:6,xp:2300,proficiencyBonus:3},saves:{int:7},skills:{arcana:7},
    defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{},languages:{values:[]},
    traits:[],actions:[],bonusActions:[],reactions:[],legendaryActions:[],spellcasting:[{
      groupId:'casting-main',featureName:'Declared Casting',description:'AI声明的完整施法能力。',evidence:[{...evidence}],
      ability:'int',abilityEvidence:[{...evidence}],saveDc:17,saveDcEvidence:[{...evidence}],attackBonus:9,attackBonusEvidence:[{...evidence}],
      casterLevel:11,casterLevelEvidence:[{...evidence}],
      spellRefs:[ref('casting-main','Spark'),ref('ward','Ward'),ref('step','Step'),ref('counter','Counter')],
      usageGroups:[
        {usage:'at-will',evidence:[{...evidence}],spellRefs:['casting-main']},
        {usage:'daily-shared',count:3,evidence:[{...evidence}],spellRefs:['ward','step']},
        {usage:'prepared-slots',level:3,levelEvidence:[{...evidence}],slots:2,slotsEvidence:[{...evidence}],evidence:[{...evidence}],spellRefs:['counter']},
      ],
    }],
  }};
}
const groups=(ir:any):any[]=>ir.creature.spellcasting;
const spells=(ir:any):any[]=>groups(ir).flatMap(group=>group.usageGroups.flatMap((usage:any)=>usage.spellRefs));
const withoutTechnicalRef=(entry:any)=>{
  const {refId,reuseOf,...data}=entry;
  return {...data,...(reuseOf===undefined?{}:{reuseOf:{groupId:reuseOf.groupId}})};
};

function appendCatalog(ir:any){
  const second=structuredClone(groups(ir)[0]);second.groupId='casting-second';second.featureName='Second Declared Casting';
  const ids=new Map(second.spellRefs.map((entry:any)=>[entry.refId,'second-'+entry.refId]));
  for(const entry of second.spellRefs)entry.refId=ids.get(entry.refId);
  for(const usage of second.usageGroups)usage.spellRefs=usage.spellRefs.map((id:string)=>ids.get(id));
  groups(ir).push(second);return second;
}

/** Compare complete objects and resource groups, allowing technical ref keys only. */
function expectExpanded(before:any,after:any,fillIdentifiers=false){
  expect(groups(after)).toHaveLength(groups(before).length);
  const ids:string[]=groups(after).map(group=>group.groupId);
  for(const [groupIndex,oldGroup] of groups(before).entries()){
    const actual=groups(after)[groupIndex],definitions=new Map(oldGroup.spellRefs.map((entry:any)=>[entry.refId,entry]));
    const {spellRefs:catalog,usageGroups:oldUsages,componentWaivers:oldWaivers,...oldFields}=oldGroup;
    const {usageGroups:newUsages,...newFields}=actual;
    expect(newFields).toEqual({...oldFields,componentWaivers:oldWaivers??[]});
    expect(newUsages).toHaveLength(oldUsages.length);expect(actual).not.toHaveProperty('spellRefs');
    for(const [usageIndex,oldUsage] of oldUsages.entries()){
      const {spellRefs:members,...oldUsageFields}=oldUsage,{spellRefs:expanded,...newUsageFields}=newUsages[usageIndex];
      expect(newUsageFields).toEqual(oldUsageFields);expect(expanded).toHaveLength(members.length);
      members.forEach((id:string,index:number)=>{
        const definition=structuredClone(definitions.get(id)) as any;
        if(fillIdentifiers&&definition.identifier===undefined)definition.identifier=(definition.englishName??definition.originalName).trim();
        expect(withoutTechnicalRef(expanded[index])).toEqual(withoutTechnicalRef(definition));
        expect(expanded[index].refId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);ids.push(expanded[index].refId);
      });
    }
  }
  expect(new Set(ids).size).toBe(ids.length);
}

function normalize(ir:any,source=SOURCE){return normalizeMonsterIntakeProposal(source,ir as MonsterIntakeIR,{start:0,end:source.length});}
function providerFixture(answer:unknown){
  const requests:any[]=[];
  const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',baseUrl:'https://catalog-format.invalid/v1',apiKey:'offline-fixture',
    model:'fixture',reviewModel:'fixture',timeoutMs:1000,repairTimeoutMs:1000,maxAttempts:1,evidenceAnchoring:'exact-quotes',
    httpClient:async(_url,init)=>{requests.push(JSON.parse(String(init.body)));return{ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(answer)}}]})};}});
  return{provider,requests};
}

describe('explicit same-parent spell catalog formatting',()=>{
  test('inlines every complete definition once and preserves profile, resources, restrictions and evidence',()=>{
    const original=catalogFixture(),before=structuredClone(original),working=structuredClone(original);
    const heldDefinition=groups(working)[0].spellRefs[0],definitionBefore=structuredClone(heldDefinition);
    inlineDeclaredSpellCatalogs(working);expectExpanded(before,working);
    expect(validateMonsterIntakeIR(SOURCE,working).blocking).toEqual([]);
    expect(groups(working)[0].componentWaivers).toEqual([]);
    expect(spells(working)[0].refId).not.toBe('casting-main'); // group/ref collision is technical only.
    expect(spells(working).slice(1).map(entry=>entry.refId)).toEqual(['ward','step','counter']);
    spells(working)[0].aliases.push('mutated expanded alias');spells(working)[0].restrictions[0].text='mutated expanded restriction';
    expect(heldDefinition).toEqual(definitionBefore);expect(original).toEqual(before);
  });

  test('the join does not read source text or derive spell facts from names',()=>{
    const original=catalogFixture(),before=structuredClone(original);
    expect(SOURCE).not.toContain('Spark');expect(SOURCE).not.toContain('3/day');
    const first=normalize(original),second=normalize(original,'A different document, still without spell grants.');
    expect(first.creature).toEqual(second.creature);expectExpanded(before,first);expect(original).toEqual(before);
  });

  test('already canonical IR stays identical and repeated formatting is idempotent',()=>{
    const canonical=normalize(catalogFixture()),before=structuredClone(canonical);
    inlineDeclaredSpellCatalogs(canonical);expect(canonical).toEqual(before);
    expect(normalize(canonical)).toEqual(before);expect(normalize(normalize(canonical))).toEqual(before);
  });

  test.each([{label:'empty',componentWaivers:[]},{label:'material',componentWaivers:[{component:'material',evidence:[evidence]}]}])('preserves an explicitly declared $label component waiver collection',({componentWaivers})=>{
    const original=catalogFixture();groups(original)[0].componentWaivers=structuredClone(componentWaivers);
    const before=structuredClone(original),actual=normalize(original);
    expectExpanded(before,actual);expect(groups(actual)[0].componentWaivers).toEqual(componentWaivers);expect(original).toEqual(before);
    expect(validateMonsterIntakeIR(SOURCE,actual).blocking).toEqual([]);
  });

  test('does not replace an explicitly invalid waiver collection with an empty one',()=>{
    const original=catalogFixture();groups(original)[0].componentWaivers=null;
    const actual=normalize(original);expect(groups(actual)[0].componentWaivers).toBeNull();
    expect(validateMonsterIntakeIR(SOURCE,actual).blocking).toContainEqual(expect.objectContaining({path:'/creature/spellcasting/0/componentWaivers'}));
  });

  test('multiple valid parent catalogs expand together and namespace collisions without changing spell content',()=>{
    const original=catalogFixture(),second=appendCatalog(original);
    const oldSecond=second.spellRefs[0].refId;second.spellRefs[0]=structuredClone(groups(original)[0].spellRefs[0]);
    second.usageGroups[0].spellRefs=[second.spellRefs[0].refId];
    expect(oldSecond).not.toBe(second.spellRefs[0].refId);
    second.spellRefs[0].reuseOf={groupId:'casting-main',refId:'casting-main'};
    const before=structuredClone(original),actual=normalize(original);
    expectExpanded(before,actual);
    const firstRef=groups(actual)[0].usageGroups[0].spellRefs[0],secondRef=groups(actual)[1].usageGroups[0].spellRefs[0];
    expect(firstRef.refId).not.toBe(secondRef.refId);expect(secondRef.reuseOf).toEqual({groupId:'casting-main',refId:firstRef.refId});
    expect(original).toEqual(before);
  });

  const rejected:Array<[string,(ir:any)=>void]>=[
    ['duplicate definitions',ir=>{groups(ir)[0].spellRefs.push(structuredClone(groups(ir)[0].spellRefs[0]));}],
    ['duplicate members in one usage',ir=>{groups(ir)[0].usageGroups[0].spellRefs.push('casting-main');}],
    ['duplicate members across usages',ir=>{groups(ir)[0].usageGroups[1].spellRefs.push('casting-main');}],
    ['unused definitions',ir=>{groups(ir)[0].spellRefs.push(ref('unused','Unused'));}],
    ['dangling ID',ir=>{groups(ir)[0].usageGroups[0].spellRefs=['absent'];}],
    ['spell name substituted for its ID',ir=>{groups(ir)[0].usageGroups[0].spellRefs=['Spark'];}],
    ['mixed string and embedded members',ir=>{groups(ir)[0].usageGroups[1].spellRefs[1]=structuredClone(groups(ir)[0].spellRefs[2]);}],
    ['embedded-only usage with a parent directory',ir=>{groups(ir)[0].usageGroups[0].spellRefs=[structuredClone(groups(ir)[0].spellRefs[0])];}],
    ['nonstring member',ir=>{groups(ir)[0].usageGroups[0].spellRefs=[17];}],
    ['empty definitions',ir=>{groups(ir)[0].spellRefs=[];}],
    ['empty member list',ir=>{groups(ir)[0].usageGroups[0].spellRefs=[];}],
    ['invalid definition ID',ir=>{groups(ir)[0].spellRefs[0].refId='';}],
    ['cross-parent ID',ir=>{const second=appendCatalog(ir);second.usageGroups[0].spellRefs=['casting-main'];}],
  ];
  for(const [label,mutate] of rejected)test('leaves '+label+' unchanged and structurally rejected',()=>{
    const original=catalogFixture();mutate(original);const before=structuredClone(original),working=structuredClone(original);
    inlineDeclaredSpellCatalogs(working);expect(working).toEqual(before);
    const actual=normalize(original);expect(actual).toEqual(before);expect(original).toEqual(before);
    expect(validateMonsterIntakeIR(SOURCE,actual).blocking.length).toBeGreaterThan(0);
  });

  test.each([0,1])('a failed catalog at parent %i prevents every parent from partially expanding',badIndex=>{
    const original=catalogFixture();appendCatalog(original);groups(original)[badIndex].usageGroups[0].spellRefs=['missing'];
    const before=structuredClone(original),working=structuredClone(original);inlineDeclaredSpellCatalogs(working);
    expect(working).toEqual(before);expect(normalize(original)).toEqual(before);
    for(const group of groups(working)){expect(group).toHaveProperty('spellRefs');expect(group).not.toHaveProperty('componentWaivers');}
  });

  test('unknown execution fields are preserved for the closed structure gate to reject',()=>{
    const original=catalogFixture();groups(original)[0].spellRefs[1].system={activities:{macro:'untrusted'}};
    const before=structuredClone(original),actual=normalize(original);
    expect(groups(actual)[0].usageGroups[1].spellRefs[0].system).toEqual({activities:{macro:'untrusted'}});
    expect(validateMonsterIntakeIR(SOURCE,actual).blocking).toContainEqual(expect.objectContaining({code:'UNKNOWN_PROPERTY',path:'/creature/spellcasting/0/usageGroups/1/spellRefs/0/system'}));
    expect(original).toEqual(before);
  });

  test('the public provider uses the same complete-object formatting without mutating its raw reply',async()=>{
    const original=catalogFixture(),before=structuredClone(original),{provider,requests}=providerFixture(original);
    const result=await provider.extract({source:SOURCE,sourceSha256:sha256(SOURCE),candidate:{id:'catalog',label:'AI catalog',start:0,end:SOURCE.length,quote:SOURCE}});
    expect(requests).toHaveLength(1);expectExpanded(before,result);expect(result).toEqual(normalize(original));
    expect(validateMonsterIntakeIR(SOURCE,result).blocking).toEqual([]);expect(original).toEqual(before);
  });

  test('the public provider retains a dangling catalog for explicit structural rejection instead of repairing it',async()=>{
    const original=catalogFixture();groups(original)[0].usageGroups[0].spellRefs=['missing'];
    const before=structuredClone(original),{provider,requests}=providerFixture(original);
    const result=await provider.extract({source:SOURCE,sourceSha256:sha256(SOURCE),candidate:{id:'dangling',label:'Dangling catalog',start:0,end:SOURCE.length,quote:SOURCE}});
    expect(requests).toHaveLength(1);expect(result).toEqual(before);expect(original).toEqual(before);
    expect(validateMonsterIntakeIR(SOURCE,result).blocking.length).toBeGreaterThan(0);
  });
});

const captureRoot=process.env.FORGE_SPELL_CATALOG_CAPTURE_ROOT;
test.skipIf(!captureRoot)('saved real Mage catalog preserves all twelve spells and their exact usage groups',()=>{
  const irPath=join(captureRoot!,'mage-en','source-ir.json'),sourcePath=join(captureRoot!,'mage-en','source.md');
  const rawIr=readFileSync(irPath,'utf8'),rawSource=readFileSync(sourcePath,'utf8'),original=JSON.parse(rawIr),before=structuredClone(original);
  expect(groups(original).some(group=>Array.isArray(group.spellRefs))).toBe(true);
  expect(groups(original).flatMap(group=>group.spellRefs??[])).toHaveLength(12);
  const working=structuredClone(original);inlineDeclaredSpellCatalogs(working);expectExpanded(before,working);
  const actual=normalize(original,rawSource);expectExpanded(before,actual,true);expect(spells(actual)).toHaveLength(12);
  expect(validateMonsterIntakeIR(rawSource,actual).blocking).toEqual([]);
  expect(original).toEqual(before);expect(readFileSync(irPath,'utf8')).toBe(rawIr);expect(readFileSync(sourcePath,'utf8')).toBe(rawSource);
});
