import {describe,expect,test} from 'bun:test';
import yaml from 'js-yaml';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {assembleStagedMonsterIntake,validateStagedBaseFacts,validateStagedBaseIntake} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import type {CanonicalMonster} from '@fvtt-json-generator/intake-ai/types';

// Source fixtures exercise 2024's alternative-size identity contract. These
// deliberately independent creatures assert grammar, not any invented rule
// equivalence to the separately tested complete official 2024 Vampire.
const HEADER='Choice Guardian CR 2\nAC 15\nHP 30 (4d8 + 12)\nSpeed 30 ft.\nSTR 14 DEX 10 CON 16 INT 3 WIS 10 CHA 1\n';
const BODY='Traits\nWatchful. It remains alert while awake.\nActions\nPush. A target within 5 feet is pushed 10 feet.\n';
const SOURCE_CASES=[
  {header:'Medium or Small construct',literal:'Medium or Small',sizes:['medium','small']},
  {header:'Size Tiny, Small, or Medium\nType Construct',literal:'Tiny, Small, or Medium',sizes:['tiny','small','medium']},
  {header:'中型或大型构装生物',literal:'中型或大型',sizes:['medium','large']},
  {header:'Size: "Small or Large construct"',literal:'Small or Large',sizes:['small','large']},
] as const;
function source(header:string,newline='\n'){return(HEADER+header+'\n'+BODY).replaceAll('\n',newline);}
function facts(size:CanonicalMonster['identity']['size']='medium',sourceSize?:string){return{schemaVersion:1,creature:{
  identity:{name:'Choice Guardian',size,creatureType:'construct',...(sourceSize!==undefined?{sourceSize}:{})},
  abilities:{str:14,dex:10,con:16,int:3,wis:10,cha:1},attributes:{ac:15,hp:{value:30,formula:'4d8 + 12'},movement:{walk:30},cr:2},
  saves:{},skills:{},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{},languages:{values:[]},
},uncertainties:[]};}
function plan(text:string){return splitStagedMonsterSource({source:text,sourceSha256:sha256(text),candidate:{id:'choice-guardian',label:'Choice Guardian',start:0,end:text.length,quote:text}});}
function assemble(text:string,size:CanonicalMonster['identity']['size']='medium',literal?:string){const graph=plan(text);return assembleStagedMonsterIntake(graph,validateStagedBaseFacts(graph,facts(size,literal)),graph.features.map(unit=>({schemaVersion:1,unitId:unit.id,mode:'manual',facts:{}})));}
async function generate(ir:ReturnType<typeof assemble>){const markdown=renderMonsterIntakeMarkdown(ir);return{markdown,actor:(await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null})).rawJson as any};}
function blocks(text:string,ir:ReturnType<typeof assemble>,markdown:string,actor:unknown){return verifyMonsterIntake(text,ir,markdown,actor).findings.filter(finding=>finding.blocking);}
const NATIVE={tiny:'tiny',small:'sm',medium:'med',large:'lg',huge:'huge',gargantuan:'grg'} as const;

describe('2024 source-explicit size alternatives across the formal Markdown/Actor chain',()=>{
  for(const row of SOURCE_CASES)for(const size of row.sizes)test(row.header+' / current '+size,async()=>{
    const text=source(row.header),base=facts(size),before=structuredClone(base),graph=plan(text);
    const verified=validateStagedBaseFacts(graph,base),ir=assemble(text,size),{markdown,actor}=await generate(ir);
    expect(base).toEqual(before);
    expect(verified.creature.identity).toEqual({name:'Choice Guardian',size,creatureType:'construct',sourceSize:row.literal});
    expect(ir.creature.identity).toEqual(verified.creature.identity);
    expect(ir.coverage.map(entry=>entry.quote).join('')).toBe(text);
    const claim=ir.claims.find(claim=>claim.path==='/creature/identity/sourceSize')!;
    expect(claim.evidence).toHaveLength(1);
    expect(text.slice(claim.evidence[0]!.start,claim.evidence[0]!.end)).toBe(graph.base.quote);
    expect(validateMonsterIntakeIR(text,ir).blocking).toEqual([]);
    expect(actor.system.traits.size).toBe(NATIVE[size]);
    expect(actor.system.details.biography.value).toContain('原文体型选项：'+row.literal);
    expect(actor.system.details.biography.value).toContain('GM 可从上述原文选项中选择体型');
    expect(actor.system.details.biography.value).not.toContain('角色卡使用最大原生尺寸');
    expect(actor.flags.fvttJsonGenerator.biographyPresentation.programNotes).toEqual([`原文体型选项：${row.literal}。角色卡当前体型：${size}；GM 可从上述原文选项中选择体型，原生尺寸字段仅表示当前选择。`]);
    expect(blocks(text,ir,markdown,actor)).toEqual([]);
    // Full-Actor equality outside the two source presentation fields and the
    // ordinary creation timestamps proves activities/effects and unrelated
    // native values do not acquire alternative-size mechanics.
    const single=await generate(assemble(source('Size '+size+'\nType Construct'),size));
    const withoutPresentation=(value:any)=>{const out=structuredClone(value);out.system.details.biography.value='';delete out.flags.fvttJsonGenerator.biographyPresentation;expect(out._stats.createdTime).toEqual(expect.any(Number));expect(out._stats.modifiedTime).toEqual(expect.any(Number));delete out._stats.createdTime;delete out._stats.modifiedTime;return out;};
    expect(withoutPresentation(actor)).toEqual(withoutPresentation(single.actor));
  });
  test('CRLF and complete base-IR program completion retain the same exact choices',async()=>{
    const text=source('Small or Medium construct','\r\n'),graph=plan(text),base=validateStagedBaseFacts(graph,facts('small'));
    delete base.creature.identity.sourceSize;
    base.claims=base.claims.filter(claim=>claim.path!=='/creature/identity/sourceSize');
    for(const entry of base.coverage)entry.claimPaths=entry.claimPaths.filter(path=>path!=='/creature/identity/sourceSize');
    const recovered=validateStagedBaseIntake(graph,base);
    expect(recovered.creature.identity.sourceSize).toBe('Small or Medium');
    expect(recovered.claims.some(claim=>claim.path==='/creature/identity/sourceSize')).toBeTrue();
    const ir=assemble(text,'small'),out=await generate(ir);
    expect(blocks(text,ir,out.markdown,out.actor)).toEqual([]);
  });
  test('swarm members remain independent from the selectable whole-swarm sizes',async()=>{
    const text=source('Medium or Large swarm of Tiny constructs'),ir=assemble(text,'large'),out=await generate(ir);
    expect(ir.creature.identity).toEqual({name:'Choice Guardian',size:'large',creatureType:'construct',sourceSize:'Medium or Large',swarmSize:'tiny'});
    expect(out.actor.system.details.type.swarm).toBe('tiny');
    expect(out.actor.system.traits.size).toBe('lg');
    expect(blocks(text,ir,out.markdown,out.actor)).toEqual([]);
  });
});

describe('size choices remain strictly source bound, with no unknown/range/conjunction fallback',()=>{
  for(const header of ['Medium and Small construct','Medium to Large construct','Size Medium and Small\nType Construct','Size Medium, Small\nType Construct','Size Medium or Immense\nType Construct','中型和大型构装生物','体型：中型至大型\n类型：构装生物','体型：中型或者未知\n类型：构装生物','Size Medium or Medium\nType Construct'])test(header,()=>{
    expect(()=>assemble(source(header))).toThrow('UNSUPPORTED_STATIC_FACT');
  });
  test('conflicting declarations and a current size outside the complete options reject',()=>{
    expect(()=>assemble(source('Medium or Small construct\nSize Small'))).toThrow('CONFLICTING_STATIC_FACT');
    expect(()=>assemble(source('Medium or Small construct'),'large')).toThrow('BASE_STATIC_CONFLICT');
  });
  for(const supplied of ['Medium','Small or Large','Small or Medium','中型或小型'])test('forged or incomplete sourceSize: '+supplied,()=>{
    expect(()=>assemble(source('Medium or Small construct'),'medium',supplied)).toThrow('identity/sourceSize');
  });
  test('an ordinary header cannot acquire alternatives from transformation prose',()=>{
    const text=source('Medium construct').replace('It remains alert while awake.','It can transform into a Small or Large construct.');
    const ir=assemble(text);
    expect(ir.creature.identity.sourceSize).toBeUndefined();
    expect(()=>assemble(text,'medium','Small or Large')).toThrow('identity/sourceSize');
    expect(()=>assemble(text,'small')).toThrow('identity/size');
  });
  test('full IR rejects deleted/altered options and ability-body evidence substitution',async()=>{
    const text=source('Medium or Small construct').replace('It remains alert while awake.','It can appear Medium or Small.'),ir=assemble(text),out=await generate(ir);
    for(const mutate of [
      (copy:any)=>delete copy.creature.identity.sourceSize,
      (copy:any)=>copy.creature.identity.sourceSize='Medium',
      (copy:any)=>copy.creature.identity.sourceSize=['Medium','Small'],
      (copy:any)=>copy.creature.identity.sourceSize=3,
      (copy:any)=>copy.creature.identity.size='large',
      (copy:any)=>copy.claims=copy.claims.filter((claim:any)=>claim.path!=='/creature/identity/sourceSize'),
      (copy:any)=>{const quote='Medium or Small',start=text.lastIndexOf(quote);copy.claims.find((claim:any)=>claim.path==='/creature/identity/sourceSize').evidence=[{start,end:start+quote.length,quote}];},
    ]){const copy=structuredClone(ir);mutate(copy);expect(blocks(text,copy,out.markdown,out.actor).length).toBeGreaterThan(0);}
  });
  test('native size, visible options, Markdown options and program metadata tampering each reject independently',async()=>{
    const text=source('Medium or Small construct'),ir=assemble(text),{markdown,actor}=await generate(ir);
    for(const mutate of [
      (copy:any)=>copy.system.traits.size='lg',
      (copy:any)=>copy.system.details.biography.value=copy.system.details.biography.value.replaceAll('Medium or Small','Medium'),
      (copy:any)=>copy.system.details.biography.value='',
      (copy:any)=>delete copy.flags.fvttJsonGenerator.biographyPresentation,
      (copy:any)=>copy.flags.fvttJsonGenerator.biographyPresentation.programNotes=[],
    ]){const copy=structuredClone(actor);mutate(copy);expect(blocks(text,ir,markdown,copy).length).toBeGreaterThan(0);}
    const front=markdown.match(/^---\n([^]*?)\n---/u)!,document=yaml.load(front[1]!) as any;
    document.传记=document.传记.replaceAll('Medium or Small','Medium');
    const changed='---\n'+yaml.dump(document,{noRefs:true,lineWidth:-1})+'---\n';
    expect(blocks(text,ir,changed,actor).some(finding=>finding.code==='MARKDOWN_SIZE_OPTIONS_LOSS')).toBeTrue();
  });
  test('ordinary single size and the previously approved Colossal boundary remain separate',async()=>{
    for(const row of [{header:'Size Medium\nType Construct',size:'medium' as const,literal:undefined},{header:'Size Colossal (45 ft. tall)\nType Construct',size:'gargantuan' as const,literal:'Colossal (45 ft. tall)'}]){
      const text=source(row.header),ir=assemble(text,row.size),out=await generate(ir);
      expect(ir.creature.identity.sourceSize).toBe(row.literal);
      expect(out.actor.system.details.biography.value).not.toContain('原文体型选项：');
      expect(blocks(text,ir,out.markdown,out.actor)).toEqual([]);
      if(row.literal)expect(out.actor.system.details.biography.value).toContain('尺寸相关规则由 GM 手动判断');
    }
  });
});
