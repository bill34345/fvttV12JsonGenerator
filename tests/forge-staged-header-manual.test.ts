import {describe,expect,test} from 'bun:test';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {assembleStagedMonsterIntake,validateStagedBaseFacts,runStagedMonsterExtraction} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import githFirstUi from './fixtures/forge-gith-first-ui-base-failure.json';

const HEADER=`Guardian CR 2\nAC 15\nHP 30 (4d8 + 12) Size Medium\nSpeed 30 ft. Type Construct\nSTR 14 DEX 10 CON 16 INT 3 WIS 10 CHA 1\n`;
const BODY='Traits\nWatchful. It remains alert while awake.\nActions\nPush. A target within 5 feet is pushed 10 feet.\n';
function facts(){return {schemaVersion:1,creature:{
  identity:{name:'Guardian',size:'medium',creatureType:'construct'},
  abilities:{str:14,dex:10,con:16,int:3,wis:10,cha:1},
  attributes:{ac:15,hp:{value:30,formula:'4d8 + 12'},movement:{walk:30},cr:2},
  saves:{},skills:{},defenses:{resistances:[] as string[],immunities:[] as string[],vulnerabilities:[] as string[],conditionImmunities:[] as string[]},
  senses:{},languages:{values:[]},
},uncertainties:[]};}
function plan(source:string){return splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id:'guardian',label:'Guardian',start:0,end:source.length,quote:source}});}
function assemble(source:string,base:ReturnType<typeof facts>){
  const graph=plan(source),verified=validateStagedBaseFacts(graph,base);
  return assembleStagedMonsterIntake(graph,verified,graph.features.map(unit=>({schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}})));
}
async function actor(ir:ReturnType<typeof assemble>){
  return (await convertMarkdownContentToJson({content:renderMonsterIntakeMarkdown(ir),fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null})).rawJson as any;
}
function verifyGeneratedActor(ir:ReturnType<typeof assemble>,output:unknown){
  const source=ir.coverage.map(entry=>entry.quote).join('');
  return {blocking:verifyMonsterIntake(source,ir,renderMonsterIntakeMarkdown(ir),output).findings.filter(finding=>finding.blocking)};
}
describe('complete manual stat-header rules without false native defenses',()=>{
  for(const type of ['中型类人（吉斯人）','中型类人生物（吉斯人）','Medium humanoid (Gith)'])test('source header annotations survive the actual saved base reply: '+type,async()=>{
    const source=githFirstUi.candidate.quote.replace('中型类人（吉斯人）',type);
    const graph=plan(source),raw=structuredClone(githFirstUi.baseResponse),before=JSON.stringify(raw);
    const verified=validateStagedBaseFacts(graph,raw);
    expect(JSON.stringify(raw)).toBe(before);
    expect(verified.creature.identity.creatureType).toBe('humanoid');
    expect(verified.creature.identity.creatureTypeCustom).toBe(type.startsWith('Medium')?'Gith':'吉斯人');
    const ir=await runStagedMonsterExtraction({source,sourceSha256:sha256(source),candidate:{id:'header-regression',label:'Header regression',start:0,end:source.length,quote:source}},async()=>structuredClone(raw),{baseMode:'facts',featureMode:'source'});
    const output=await actor(ir);
    expect(output.system.attributes.ac.flat).toBe(18);
    expect(output.system.details.type.custom).toBe(verified.creature.identity.creatureTypeCustom);
    const defense=output.items.find((item:any)=>item.name.includes('灵能护体'));
    expect(defense.system.description.value).toContain('未着装任何护甲也未持用任何盾牌');
    expect(defense.flags.fvttJsonGenerator.manualRule.sourceText).toContain('感知调整值');
    expect(defense.effects).toEqual([]);
    expect(verifyGeneratedActor(ir,output).blocking).toEqual([]);
    const wrongTiming=structuredClone(ir);wrongTiming.creature.spellcasting![0]!.activationType='reaction';
    expect(validateMonsterIntakeIR(source,wrongTiming).blocking.some(finding=>finding.code==='SPELL_ACTIVATION_SOURCE_MISMATCH')).toBe(true);
  });

  test('a later bold Traits section cannot inherit a previous Actions casting override',()=>{
    const source=githFirstUi.candidate.quote.replace('**施法Spellcasting','**特性Traits**\n**施法Spellcasting');
    const graph=plan(source),base=validateStagedBaseFacts(graph,structuredClone(githFirstUi.baseResponse));
    const ir=assembleStagedMonsterIntake(graph,base,graph.features.map(unit=>({schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}})));
    expect(ir.creature.spellcasting![0]!.activationType).toBeUndefined();
    ir.creature.spellcasting![0]!.activationType='action';
    expect(validateMonsterIntakeIR(source,ir).blocking.some(finding=>finding.code==='SPELL_ACTIVATION_SOURCE_MISMATCH')).toBe(true);
  });

  test('wrong types, conflicting annotations and a missing referenced AC definition still block',()=>{
    const source=githFirstUi.candidate.quote,raw=structuredClone(githFirstUi.baseResponse);
    const wrong=structuredClone(raw);wrong.creature.identity.creatureType='fiend';
    expect(()=>validateStagedBaseFacts(plan(source),wrong)).toThrow('identity/creatureType');
    const subtype=structuredClone(raw);Object.assign(subtype.creature.identity,{creatureTypeCustom:'Dwarf'});
    expect(()=>validateStagedBaseFacts(plan(source),subtype)).toThrow('identity/creatureTypeCustom');
    const missing=source.replace(/^\*\*灵能护体[^\r\n]*[\r\n]*/mu,'');
    expect(()=>validateStagedBaseFacts(plan(missing),raw)).toThrow('attributes/ac');
    expect(()=>validateStagedBaseFacts(plan(source.replace('中型类人（吉斯人）','中型类人或邪魔（吉斯人）')),raw)).toThrow('identity/creatureType');
  });

  const cases=[
    {name:'non-type conditional resistance',line:'Resistances Cold; Attacks made without Advantage\n',supplied:['cold','Attacks made without Advantage'],native:['cold'],field:'resistances'},
    {name:'qualified comma clause',line:'Damage Resistances Bludgeoning, Piercing, Slashing from nonmagical attacks\n',supplied:['bludgeoning','piercing','slashing from nonmagical attacks'],native:[],field:'resistances'},
    {name:'qualifier with a separate unconditional clause',line:'Damage Immunities Fire; Cold while submerged\n',supplied:['fire','cold while submerged'],native:['fire'],field:'immunities'},
  ] as const;
  for(const row of cases)test(row.name,async()=>{
    const source=HEADER+row.line+BODY,base=facts();base.creature.defenses[row.field]=[...row.supplied];
    const before=structuredClone(base),ir=assemble(source,base),output=await actor(ir);
    expect(base).toEqual(before);
    expect(ir.creature.defenses[row.field]).toEqual([...row.native]);
    expect(ir.creature.traits).toHaveLength(2);
    const header=ir.creature.traits[0]!;
    expect(header.description).toBe(row.line);
    expect(header.executionMode).toBe('gm-manual');
    expect(source.slice(header.evidence![0]!.start,header.evidence![0]!.end)).toBe(row.line);
    expect(ir.coverage.map(entry=>entry.quote).join('')).toBe(source);
    expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
    expect(verifyGeneratedActor(ir,output).blocking).toEqual([]);
    expect(output.effects).toEqual([]);
    const item=output.items.find((item:any)=>item.name===header.name)!;
    expect(item.flags.fvttJsonGenerator.manualRule.sourceText).toBe(row.line);
    expect(Object.values(item.system.activities).map((activity:any)=>activity.type)).toEqual(['utility']);
    expect(item.effects).toEqual([]);
  });
  test('nonstandard condition remains full manual text beside valid native immunities',async()=>{
    const line='Immunities Acid, Fire; Charmed, Diseased, Paralyzed\n',source=HEADER+line+BODY,base=facts();
    base.creature.defenses.immunities=['acid','fire'];base.creature.defenses.conditionImmunities=['charmed','diseased','paralyzed'];
    const ir=assemble(source,base),output=await actor(ir);
    expect(ir.creature.defenses.conditionImmunities).toEqual(['charmed','paralyzed']);
    expect(output.system.traits.ci.value).toEqual(['charmed','paralyzed']);
    expect(ir.creature.traits[0]!.description).toBe(line);
    expect(verifyGeneratedActor(ir,output).blocking).toEqual([]);
    const missing=structuredClone(output);missing.items=missing.items.filter((item:any)=>item.name!=='Immunities');
    expect(verifyGeneratedActor(ir,missing).blocking.length).toBeGreaterThan(0);
    const changed=structuredClone(output),item=changed.items.find((item:any)=>item.name==='Immunities');
    item.flags.fvttJsonGenerator.manualRule.sourceText='Immunities Acid, Fire; Charmed, Paralyzed';
    expect(verifyGeneratedActor(ir,changed).blocking.length).toBeGreaterThan(0);
  });
  test('combined unknown immunity placement cannot invent native damage or conditions',()=>{
    const line='Immunities Fire; Attacks made without Advantage\n',source=HEADER+line+BODY;
    for(const field of ['immunities','conditionImmunities'] as const){
      const base=facts();base.creature.defenses.immunities=['fire'];base.creature.defenses[field].push('Attacks made without Advantage');
      const ir=assemble(source,base);
      expect(ir.creature.defenses.immunities).toEqual(['fire']);
      expect(ir.creature.defenses.conditionImmunities).toEqual([]);
      expect(ir.creature.traits[0]!.description).toBe(line);
    }
  });
  test('unknown model text and missing unconditional defenses remain blocking',()=>{
    const source=HEADER+'Resistances Cold; Attacks made without Advantage\n'+BODY;
    const missing=facts(),invented=facts();invented.creature.defenses.resistances=['cold','fire'];
    expect(()=>assemble(source,missing)).toThrow('BASE_STATIC_CONFLICT');
    expect(()=>assemble(source,invented)).toThrow('BASE_STATIC_CONFLICT');
  });
  test('ordinary header stays native without extra items or changes to other facts',async()=>{
    const plain=assemble(HEADER+BODY,facts()),base=facts();
    base.creature.defenses.resistances=['cold'];base.creature.defenses.immunities=['fire'];base.creature.defenses.conditionImmunities=['charmed'];
    const ir=assemble(HEADER+'Resistances Cold\nImmunities Fire; Charmed\n'+BODY,base);
    expect(ir.creature.traits).toEqual(plain.creature.traits.map(feature=>({...feature,evidence:ir.creature.traits[0]!.evidence})));
    for(const key of ['identity','abilities','attributes','saves','skills','senses','languages'] as const)expect(ir.creature[key]).toEqual(plain.creature[key]);
    expect(verifyGeneratedActor(ir,await actor(ir)).blocking).toEqual([]);
  });
  test('CRLF continuation and whole-header source offsets stay exact',()=>{
    const line='Resistances Cold; Bludgeoning,\r\nPiercing, Slashing from nonmagical attacks\r\n';
    const fragment=HEADER.replace(/\n/gu,'\r\n')+line+BODY.replace(/\n/gu,'\r\n'),source='prefix\n'+fragment+'suffix';
    const graph=splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id:'guardian',label:'Guardian',start:7,end:7+fragment.length,quote:fragment}}),base=facts();
    base.creature.defenses.resistances=['cold','bludgeoning','piercing','slashing from nonmagical attacks'];
    const ir=assembleStagedMonsterIntake(graph,validateStagedBaseFacts(graph,base),graph.features.map(unit=>({schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}})));
    expect(ir.creature.traits[0]!.description).toBe(line);
    expect(source.slice(ir.creature.traits[0]!.evidence![0]!.start,ir.creature.traits[0]!.evidence![0]!.end)).toBe(line);
    expect(ir.creature.defenses.resistances).toEqual(['cold']);
  });
});
describe('approved largest native size with explicit source and GM boundary',()=>{
  for(const label of ['Colossal','Colossal (45 ft. tall)','Colossal (60 ft. long)'])test(label,async()=>{
    const source=HEADER.replace('Size Medium','Size '+label)+BODY,base=facts();base.creature.identity.size='gargantuan';
    const ir=assemble(source,base),markdown=renderMonsterIntakeMarkdown(ir),output=await actor(ir);
    expect(ir.creature.identity.sourceSize).toBe(label);
    expect(output.system.traits.size).toBe('grg');
    expect(ir.creature.traits[0]!.description).toBe('Size '+label);
    expect(markdown).toContain('尺寸相关规则由 GM 手动判断');
    expect(markdown).toContain(label);
    expect(verifyGeneratedActor(ir,output).blocking).toEqual([]);
  });
  test('an unsupported category, incorrect mapping or conflicting declared sizes stays blocking',()=>{
    expect(()=>assemble(HEADER.replace('Size Medium','Size Immense')+BODY,facts())).toThrow('UNSUPPORTED_STATIC_FACT');
    expect(()=>assemble(HEADER.replace('Size Medium','Size Colossal')+BODY,facts())).toThrow('identity/size');
    const base=facts();base.creature.identity.size='gargantuan';
    expect(()=>assemble(HEADER.replace('Size Medium','Size Colossal')+'Size Gargantuan\n'+BODY,base)).toThrow('CONFLICTING_STATIC_FACT');
  });
});
describe('source-explicit shared legendary budget remains a manual counter',()=>{
  for(const [literal,expected] of [['one',1],['two',2],['three',3],['4',4]] as const)test(literal,async()=>{
    const preamble=`Legendary Actions\nThe guardian can take ${literal} legendary action${expected===1?'':'s'}, choosing from the options below.\n`;
    const source=HEADER+BODY+preamble+'Kick. The target is pushed 5 feet.\n',ir=assemble(source,facts()),output=await actor(ir);
    expect(ir.creature.legendary?.max).toBe(expected);expect(output.system.resources.legact.max).toBe(expected);
    expect(output.system.resources.legact.spent).toBe(0);
    expect(renderMonsterIntakeMarkdown(ir).match(new RegExp('can take '+literal,'gu'))).toHaveLength(1);
    expect(verifyGeneratedActor(ir,output).blocking).toEqual([]);
    expect(output.effects).toEqual([]);
    const wrong=structuredClone(output);wrong.system.resources.legact.max=0;
    expect(verifyGeneratedActor(ir,wrong).blocking.some(finding=>finding.code==='ACTOR_LEGENDARY_BUDGET_DRIFT')).toBeTrue();
    const omitted=structuredClone(ir);delete omitted.creature.legendary;
    expect(validateMonsterIntakeIR(source,omitted).blocking.some(finding=>finding.code==='SOURCE_LEGENDARY_BUDGET_OMITTED')).toBeTrue();
  });
  test('a conditional budget stays literal without inventing one native maximum',()=>{
    const source=HEADER+BODY+'Legendary Actions\nThe guardian can take three legendary actions if it is awake, or two while sleeping.\nKick. The target is pushed 5 feet.\n';
    const ir=assemble(source,facts());expect(ir.creature.legendary).toBeUndefined();expect(ir.creature.biography).toContain('or two while sleeping');
  });
});


describe('legacy YAML identity scalars coexist with explicit swarm identity',()=>{
  const yamlSource=(size:string)=>`---
name: Guardian
size: ${size}
str: 14
dex: 10
con: 16
int: 3
wis: 10
cha: 1
armor_class: "15"
hit_points: "30 (4d8 + 12)"
speed: "30 ft."
challenge: "2"
---
${BODY}`;
  for(const row of [
    {scalar:'Medium construct',type:'construct',member:undefined},
    {scalar:'"Medium construct"',type:'construct',member:undefined},
    {scalar:"'Medium construct'",type:'construct',member:undefined},
    {scalar:'"Medium swarm of Tiny beasts, unaligned"',type:'beast',member:'tiny'},
  ] as const)for(const newline of ['\n','\r\n'])test(row.scalar+' '+JSON.stringify(newline),async()=>{
    const source=yamlSource(row.scalar).replaceAll('\n',newline),base=facts();base.creature.identity.creatureType=row.type;
    const ir=assemble(source,base),output=await actor(ir);
    expect(ir.creature.identity.name).toBe('Guardian');expect(ir.creature.identity.size).toBe('medium');
    expect(ir.creature.identity.creatureType).toBe(row.type);expect(ir.creature.identity.swarmSize).toBe(row.member);
    expect(ir.coverage.map(ref=>ref.quote).join('')).toBe(source);
    expect(output.system.details.type.value).toBe(row.type);expect(output.system.details.type.swarm??'').toBe(row.member??'');
    expect(verifyGeneratedActor(ir,output).blocking).toEqual([]);
  });
  test('quoted YAML identity still rejects a contradictory type',()=>{
    expect(()=>assemble(yamlSource('"Medium beast"'),facts())).toThrow('identity/creatureType');
  });
  test('ordinary YAML alignment omission keeps the established strict contract',()=>{
    expect(()=>assemble(yamlSource('"Medium construct, neutral evil"'),facts())).toThrow('identity/alignment');
  });
});
