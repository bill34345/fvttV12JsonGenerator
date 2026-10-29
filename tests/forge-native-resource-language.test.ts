import {describe,expect,test} from 'bun:test';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';
import {normalizeMonsterIntakeProposal} from '@fvtt-json-generator/intake-ai/provider';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import type {CanonicalFeature,MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {legendaryResistanceBinding} from '../packages/intake-ai/src/native-resources';
import yaml from 'js-yaml';

async function formal(ir:MonsterIntakeIR){
  const before=structuredClone(ir),working=normalizeMonsterIntakeProposal(LURKER_SOURCE,ir);
  const markdown=renderMonsterIntakeMarkdown(working);
  const generated=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
  expect(ir).toEqual(before);
  return {working,markdown,actor:generated.rawJson as any,verification:generated.verification};
}

describe('declared language list reception preserves native identity and literal notes',()=>{
  for(const [custom,values] of [
    ['Primordial (Ignan, Terran)',['primordial']],
    ['原初语（火族语，土族语）',['primordial']],
    ['Celestial; Deep Speech',['celestial','deep']],
    ['Elvish',['elvish']],
  ] as const)test(custom,async()=>{
    const ir=buildValidLurkerIr();ir.creature.languages={values:[],custom};
    const {actor,working}=await formal(ir);
    expect(actor.system.traits.languages).toEqual({value:[...values],custom});
    expect(normalizeMonsterIntakeProposal(LURKER_SOURCE,working)).toEqual(working);
    expect(working.creature.candidateReview?.findings??[]).toEqual([]);
    expect(JSON.stringify(working.creature.candidateReview?.proposal)).toContain(custom);
  });
  for(const custom of ['constructor','__proto__','understands Primordial but cannot speak','Primordial (understands only)','no Primordial','any two languages','Common or Elvish','Primordial (unknown dialect)','Primordial (Ignan','Primordial) (Ignan','仅理解原初语，不会说','Common; understands Elvish'])test('qualified or incomplete text stays literal: '+custom,async()=>{
    const ir=buildValidLurkerIr();ir.creature.languages={values:[],custom};
    const {actor,working}=await formal(ir);
    expect(actor.system.traits.languages).toEqual({value:[],custom});
    expect(working.creature.languages).toEqual(ir.creature.languages);
  });
  test('existing parent language and dialect note remain exactly unchanged',async()=>{
    const ir=buildValidLurkerIr();ir.creature.languages={values:['Primordial'],custom:'Ignan, Terran'};
    const {actor,working}=await formal(ir);
    expect(working.creature.languages).toEqual(ir.creature.languages);
    expect(actor.system.traits.languages).toEqual({value:['primordial'],custom:'Ignan, Terran'});
  });
  test('an unrelated complete Actor is unchanged when the existing reception is repeated',async()=>{
    const ir=buildValidLurkerIr(),a=await formal(ir),b=await formal(a.working);
    // Source-independent generation timestamps are the only excluded fields.
    b.actor._stats.createdTime=a.actor._stats.createdTime;
    b.actor._stats.modifiedTime=a.actor._stats.modifiedTime;
    expect(b.actor).toEqual(a.actor);
  });
});

const resistance=(name='Legendary Resistance',max=3):CanonicalFeature=>({name,description:'If this creature fails a saving throw, it can choose to succeed instead.',activationType:'special',uses:{max,period:'day'}});
describe('explicit daily legendary resistance uses one native Actor resource',()=>{
  test('explicit empty optional operation and effect lists equal omitted lists',async()=>{
    const ir=buildValidLurkerIr();ir.creature.traits=[resistance()];ir.claims=[];ir.coverage=[];
    const ordinary=await formal(ir);
    Object.assign(ir.creature.traits[0]!,{sourceOperations:[],appliedConditions:[],nativeFailureStatuses:[]});
    const empty=await formal(ir);
    empty.actor._stats.createdTime=ordinary.actor._stats.createdTime;empty.actor._stats.modifiedTime=ordinary.actor._stats.modifiedTime;
    expect(empty.actor).toEqual(ordinary.actor);
  });
  for(const [name,max,explicit] of [['Legendary Resistance',3,false],['传奇抗性 Legendary Resistance',2,false],['Legendary Resistance (4/Day)',4,true]] as const)test(name,async()=>{
    const ir=buildValidLurkerIr();ir.creature.traits=[resistance(name,max)];ir.claims=[];ir.coverage=[];
    if(explicit)ir.creature.legendary={max:3,recovery:'own-turn-start',preamble:'',evidence:[],resistanceMax:max};
    const {actor,working}=await formal(ir),item=actor.items.find((entry:any)=>entry.name.startsWith(name));
    expect(actor.system.resources.legres).toEqual({max,spent:0});
    expect(item.system.identifier).toBe('legendary-resistance');
    expect(item.system.uses).toEqual({max:'',spent:0,recovery:[]});
    const activities=Object.values<any>(item.system.activities);expect(activities).toHaveLength(1);
    expect(activities[0].consumption.targets).toEqual([{type:'attribute',target:'resources.legres.value',value:'1',scaling:{mode:'',formula:''}}]);
    expect(item.system.description.value).toContain('choose to succeed');
    expect(working.creature.traits[0]!.uses).toEqual({max,period:'day'});
    const check=(value:any)=>verifyMonsterIntake(LURKER_SOURCE,working,renderMonsterIntakeMarkdown(working),value).findings;
    expect(check(actor).filter(f=>f.origin==='schema'&&f.blocking)).toEqual([]);
    expect(check(actor).filter(f=>/RESOURCE|RESISTANCE/.test(f.code))).toEqual([]);
    for(const alter of [(copy:any)=>{copy.system.resources.legres.max=0;},(copy:any)=>{const own=copy.items.find((entry:any)=>entry.system.identifier==='legendary-resistance');own.system.activities[Object.keys(own.system.activities)[0]!].consumption.targets[0].target='resources.legact.value';},(copy:any)=>{copy.items.find((entry:any)=>entry.system.identifier==='legendary-resistance').system.uses.max='3';}]){
      const copy=structuredClone(actor);alter(copy);
      expect(check(copy).some(f=>/RESOURCE|RESISTANCE/.test(f.code))).toBe(true);
    }
  });
  for(const kind of ['unknown','missing-count','short-rest','conflicting-explicit'] as const)test('preserve existing boundary: '+kind,async()=>{
    const ir=buildValidLurkerIr(),feature=resistance(kind==='unknown'?'Other Resistance':'Legendary Resistance');
    if(kind==='missing-count')delete feature.uses;
    if(kind==='short-rest')feature.uses!.period='shortRest';
    if(kind==='conflicting-explicit')ir.creature.legendary={max:3,recovery:'own-turn-start',preamble:'',evidence:[],resistanceMax:2};
    ir.creature.traits=[feature];
    const {actor}=await formal(ir),item=actor.items.find((entry:any)=>entry.name===feature.name);
    expect(actor.system.resources.legres.max).toBe(kind==='conflicting-explicit'?2:0);
    expect(item.system.identifier).not.toBe('legendary-resistance');
    if(feature.uses)expect(item.system.uses.max).toBe('3');
  });
  test('a compound feature retains its separate explicit spell counters',async()=>{
    const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
    ir.creature.traits=[{...resistance(),executionMode:'native-with-gm',nativeRuleText:'Literal rule',manualRemainder:'Literal rule',spellUseRecords:[{name:'Bless',max:2,period:'day'}]}];
    const {actor}=await formal(ir),item=actor.items.find((entry:any)=>entry.name==='Legendary Resistance');
    expect(item.system.identifier).not.toBe('legendary-resistance');
    expect(Object.values<any>(item.system.activities).some(activity=>activity.name.includes('Bless')&&activity.uses.max==='2')).toBe(true);
  });
  for(const kind of ['short-rest','spell-linked'] as const)test('a qualified legacy daily trait retains its complete Actor and report beside a same-named '+kind+' trait',async()=>{
    const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
    const other:CanonicalFeature=kind==='short-rest'
      ?{...resistance(),sourceQualifier:'(short-rest)',uses:{max:3,period:'shortRest'}}
      :{...resistance(),sourceQualifier:'(spell-linked)',executionMode:'native-with-gm',nativeRuleText:'Literal rule',manualRemainder:'Literal rule',spellUseRecords:[{name:'Bless',max:2,period:'day'}]};
    ir.creature.traits=[resistance(),other];
    const {working,actor,verification}=await formal(ir),primary=working.creature.traits[0]!,secondary=working.creature.traits[1]!;
    const single=(feature:CanonicalFeature)=>yaml.load(renderMonsterIntakeMarkdown({...working,creature:{...working.creature,traits:[feature]}}).slice(4,-4)) as Record<string,any>;
    // Compose the already-supported native trait and independent secondary
    // trait at the source boundary, then compare the complete real workflow.
    const reference=single(primary);reference.特性.push(single(secondary).特性[0]);
    const expected=await convertMarkdownContentToJson({content:`---\n${yaml.dump(reference,{noRefs:true,lineWidth:-1,sortKeys:false})}---\n`,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
    const before=expected.rawJson as any;actor._stats.createdTime=before._stats.createdTime;actor._stats.modifiedTime=before._stats.modifiedTime;
    expect(actor).toEqual(before);expect(verification).toEqual(expected.verification);
    expect(actor.system.resources.legres).toEqual({max:3,spent:0});
    expect(actor.items.filter((entry:any)=>entry.system.identifier==='legendary-resistance')).toHaveLength(1);
    const distinct=actor.items.find((entry:any)=>entry.name.includes(other.sourceQualifier!));
    if(kind==='short-rest')expect(distinct.system.uses.recovery).toEqual([{period:'sr',type:'recoverAll'}]);
    else expect(Object.values<any>(distinct.system.activities).some(activity=>activity.name.includes('Bless')&&activity.uses.max==='2')).toBe(true);
  });
  for(const [name,englishName,qualifier] of [
    ['Legendary Resistance',undefined,'(3/Day)'],
    ['传奇抗性','Legendary Resistance','（3/日）'],
    ['传奇抗性',undefined,'（3/日）'],
  ] as const)test('an explicit ledger binds the unique standard trait: '+name+' '+String(englishName),async()=>{
    const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
    ir.creature.legendary={max:3,recovery:'own-turn-start',preamble:'',evidence:[],resistanceMax:3};
    ir.creature.traits=[{name,englishName,sourceQualifier:qualifier,description:'If this creature fails a saving throw, it can choose to succeed instead.',activityType:'utility',executionMode:'gm-manual'}];
    const {actor,working}=await formal(ir),item=actor.items.find((entry:any)=>entry.system.identifier==='legendary-resistance');
    expect(item).toBeDefined();expect(item.system.uses).toEqual({max:'',spent:0,recovery:[]});
    expect(Object.values<any>(item.system.activities)[0]!.consumption.targets[0]).toMatchObject({type:'attribute',target:'resources.legres.value',value:'1'});
    expect(working.creature.traits[0]!.uses).toBeUndefined();
    const findings=verifyMonsterIntake(LURKER_SOURCE,working,renderMonsterIntakeMarkdown(working),actor).findings;
    expect(findings.filter(f=>/RESOURCE|RESISTANCE|MANUAL_RULE/.test(f.code))).toEqual([]);
  });
  test('an explicit base and lair ledger shares the same resistance trait without another pool',async()=>{
    const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
    ir.creature.legendary={max:3,lairMax:4,recovery:'own-turn-start',preamble:'',evidence:[],resistanceMax:3,resistanceLairMax:4};
    ir.creature.traits=[{...resistance(),uses:undefined,activityType:'utility',executionMode:'gm-manual'}];
    const {actor,working}=await formal(ir),item=actor.items.find((entry:any)=>entry.system.identifier==='legendary-resistance');
    expect(actor.system.resources.legres).toEqual({max:3,spent:0});
    expect(actor.flags.fvttJsonGenerator.sourceLegendaryLedger).toMatchObject({resistanceMax:3,resistanceLairMax:4});
    expect(item.system.uses.max).toBe('');
    expect(Object.values<any>(item.system.activities)[0]!.consumption.targets).toHaveLength(1);
    expect(verifyMonsterIntake(LURKER_SOURCE,working,renderMonsterIntakeMarkdown(working),actor).findings.filter(f=>/RESOURCE|RESISTANCE/.test(f.code))).toEqual([]);
  });
  for(const kind of ['no-count','zero-ledger','zero-feature','short-rest','conflict','multiple','unknown','compound','shared'] as const)test('ledger binding does not guess through an ambiguous boundary: '+kind,()=>{
    const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
    ir.creature.legendary={max:3,recovery:'own-turn-start',preamble:'',evidence:[],resistanceMax:3};
    const feature:CanonicalFeature={...resistance(),uses:undefined,activityType:'utility',executionMode:'gm-manual'};
    ir.creature.traits=[feature];
    if(kind==='no-count'){delete ir.creature.legendary.resistanceMax;feature.sourceQualifier='(3/Day)';}
    if(kind==='zero-ledger')ir.creature.legendary.resistanceMax=0;
    if(kind==='zero-feature')feature.uses={max:0,period:'day'};
    if(kind==='short-rest')feature.uses={max:3,period:'shortRest'};
    if(kind==='conflict')feature.uses={max:2,period:'day'};
    if(kind==='multiple')ir.creature.traits.push({...feature,description:'A second standard named trait must not be selected over the first.'});
    if(kind==='unknown')feature.name='Other Resistance';
    if(kind==='compound')feature.spellUseRecords=[{name:'Bless',max:2,period:'day'}];
    if(kind==='shared')ir.creature.sourceResourcePools=[{id:'shared-resistance',name:'Shared resistance',max:3,period:'day',members:[{collection:'traits',index:0,featureId:'resistance',cost:1}],evidence:[]}];
    expect(legendaryResistanceBinding(ir.creature)).toBeUndefined();
    expect(renderMonsterIntakeMarkdown(ir)).not.toContain('actorResource: legres');
  });
  test('a ledger-only marker leaves the complete V12 manual Actor and report unchanged',async()=>{
    const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
    ir.creature.legendary={max:3,recovery:'own-turn-start',preamble:'',evidence:[],resistanceMax:3};
    ir.creature.traits=[{...resistance(),uses:undefined,activityType:'utility',executionMode:'gm-manual'}];
    const markdown=renderMonsterIntakeMarkdown(ir);
    expect(markdown).toContain('actorResource: legres');expect(markdown).toContain('执行模式: gm-manual');
    const withoutMarker=markdown.replace(/^[ \t]+actorResource: legres\r?\n/gmu,'');
    const options={fvttVersion:'12' as const,effectProfile:'core' as const,iconOptions:{mode:'off' as const},translationService:null};
    const [marked,original]=await Promise.all([convertMarkdownContentToJson({...options,content:markdown}),convertMarkdownContentToJson({...options,content:withoutMarker})]);
    const actor=marked.rawJson as any,before=original.rawJson as any;
    actor._stats.createdTime=before._stats.createdTime;actor._stats.modifiedTime=before._stats.modifiedTime;
    expect(actor).toEqual(before);expect(marked.verification).toEqual(original.verification);
    expect(actor.items.find((entry:any)=>entry.name==='Legendary Resistance').system.identifier).not.toBe('legendary-resistance');
  });
});
