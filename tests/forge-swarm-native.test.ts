import {describe,expect,test} from 'bun:test';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {runStagedMonsterExtraction,validateStagedBaseFacts,type StagedBaseFactsResponse} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {anchorIrEvidence,anchorIrEvidenceSourceAudit} from '@fvtt-json-generator/intake-ai/orchestrator';
import {auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {YamlParser} from '@fvtt-json-generator/parser';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import type {CanonicalMonster} from '@fvtt-json-generator/intake-ai';
import seeds from './fixtures/forge-statblock-semantic-cases.json';
import nativeCases from './fixtures/forge-native-attack-cases.json';
import {modelReply,ordinary,chain} from './helpers/forge-semantic-chain';

// Source-derived fixtures: SRD 5.1 swarm identity, the real wrapped Company
// stat header, and explicit Chinese identity. Values below are synthetic.
const seed=seeds.seeds[0]!;
const request=(source:string)=>({source,sourceSha256:sha256(source),candidate:{id:'swarm',label:'Sentinel',start:0,end:source.length,quote:source}});
type BaseCreature=StagedBaseFactsResponse['creature'];
function seedCreature():BaseCreature{
  return {...structuredClone(seed.creature),identity:{...seed.creature.identity,size:'medium'}};
}
function creature(type='beast',size:CanonicalMonster['identity']['size']='medium'):BaseCreature{
  const value=seedCreature();
  value.identity={name:seed.creature.identity.name,size,creatureType:type};
  return value;
}
function sourceWithIdentity(identity:string){
  return seed.source.replace('Sentinel CR 2','Sentinel CR 2\n'+identity).replace(' Size Medium','').replace(' Type Construct','');
}
function plan(source:string){return splitStagedMonsterSource(request(source));}
function facts(source:string,value=creature()){
  return validateStagedBaseFacts(plan(source),{schemaVersion:1,creature:value,uncertainties:[]});
}
async function extract(source:string,value:BaseCreature=creature()){
  return runStagedMonsterExtraction(request(source),async call=>{
    await call.onAttempt(1);
    return {schemaVersion:1,creature:value,uncertainties:[]};
  },{baseMode:'facts',featureMode:'source'});
}
async function actorChain(source:string,value:BaseCreature){
  const ir=await extract(source,value),markdown=renderMonsterIntakeMarkdown(ir);
  const conversion=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
  const actor=conversion.rawJson as any;
  const blocking=verifyMonsterIntake(source,ir,markdown,actor,request(source).candidate).findings.filter(finding=>finding.blocking);
  expect(blocking).toEqual([]);
  return {ir,markdown,actor};
}

const cases=[
  {name:'natural English plural',identity:'Medium swarm of Tiny beasts, unaligned',type:'beast',size:'medium',member:'tiny',alignment:'unaligned'},
  {name:'wrapped labelled English subtype',identity:'Size Huge (Swarm of\nMedium)\nType Fiend (Yugoloth)',type:'fiend',size:'huge',member:'medium',subtype:'Yugoloth'},
  {name:'wrapped natural English',identity:'Large swarm of\nSmall plants, unaligned',type:'plant',size:'large',member:'small',alignment:'unaligned'},
  {name:'Chinese prose identity',identity:'中型虫群，由微型野兽组成，无阵营',type:'beast',size:'medium',member:'tiny',alignment:'无阵营'},
  {name:'explicit Chinese compound',identity:'中型微型野兽集群，无阵营',type:'beast',size:'medium',member:'tiny',alignment:'无阵营'},
  {name:'explicit Chinese labelled',identity:'体型：大型（由小型个体组成的虫群）\n类型：植物',type:'plant',size:'large',member:'small'},
] as const;

describe('source-owned swarm identity independent of Actor size',()=>{
  for(const row of cases)for(const newline of ['\n','\r\n'])test(row.name+' '+JSON.stringify(newline),async()=>{
    const source=sourceWithIdentity(row.identity).replaceAll('\n',newline),proposal=creature(row.type,row.size),before=structuredClone(proposal);
    const ir=await extract(source,proposal);
    expect(proposal).toEqual(before);
    expect(ir.creature.identity.size).toBe(row.size);
    expect(ir.creature.identity.swarmSize).toBe(row.member);
    expect(ir.creature.identity.creatureType).toBe(row.type);
    if('alignment' in row)expect(ir.creature.identity.alignment).toBe(row.alignment);
    if('subtype' in row)expect(ir.creature.identity.creatureTypeCustom).toBe(row.subtype);
    expect(auditMonsterIntakeSource(source,ir).blocking).toEqual([]);
    const claim=ir.claims.find(claim=>claim.path==='/creature/identity/swarmSize');
    expect(claim).toBeDefined();
    for(const ref of claim!.evidence)expect(source.slice(ref.start,ref.end)).toBe(ref.quote);
    expect(ir.coverage.map(entry=>entry.quote).join('')).toBe(source);
    const markdown=renderMonsterIntakeMarkdown(ir),parsed=new YamlParser().parse(markdown);
    expect(markdown).toContain('集群个体体型:');
    expect(parsed.details.swarmSize).toBe(row.member);
    expect(parsed.traits.size).toBe(({medium:'med',huge:'huge',large:'lg'} as Record<string,string>)[row.size]);
  });
  test.each(['Beasts','BEAST','beast'])('standard type alias is canonical: %s',type=>{
    const ir=facts(sourceWithIdentity('Medium swarm of Tiny beasts, unaligned'),creature(type));
    expect(ir.creature.identity.creatureType).toBe('beast');
  });
  test('explicit source audit fills only a missing source member size and evidence',async()=>{
    const source=sourceWithIdentity('Medium swarm of Tiny beasts, unaligned'),raw=await extract(source);
    delete raw.creature.identity.swarmSize;delete raw.creature.identity.alignment;
    raw.claims=raw.claims.filter(claim=>!['/creature/identity/swarmSize','/creature/identity/alignment'].includes(claim.path));
    for(const entry of raw.coverage)entry.claimPaths=entry.claimPaths.filter(path=>!['/creature/identity/swarmSize','/creature/identity/alignment'].includes(path));
    const retained=anchorIrEvidence(source,request(source).candidate,raw);
    expect(retained.creature.identity.swarmSize).toBeUndefined();
    const normalized=anchorIrEvidenceSourceAudit(source,request(source).candidate,raw);
    expect(normalized.creature.identity.swarmSize).toBe('tiny');
    expect(normalized.creature.identity.alignment).toBe('unaligned');
    expect(auditMonsterIntakeSource(source,normalized).blocking).toEqual([]);
    expect(normalized.claims.some(claim=>claim.path==='/creature/identity/swarmSize')).toBe(true);
  });
  for(const [field,value] of [['size','tiny'],['swarmSize','small'],['creatureType','fiend'],['alignment','lawful good']] as const)test('wrong supplied '+field+' is never overwritten',()=>{
    const source=sourceWithIdentity('Medium swarm of Tiny beasts, unaligned'),proposal=creature();
    Object.assign(proposal.identity,{[field]:value});
    expect(()=>facts(source,proposal)).toThrow('identity/'+field);
  });
  for(const identity of [
    'Medium swarm of Tiny beasts\nSize Large',
    'Medium swarm of Tiny beasts\nSize Medium (Swarm of Small)',
    'Medium swarm of Tiny beasts\nType Fiend',
    'Medium swarm of Tiny beasts, unaligned\nalignment: lawful good',
  ])test('conflicting header remains review: '+identity.replaceAll('\n',' / '),()=>{
    expect(()=>facts(sourceWithIdentity(identity))).toThrow('CONFLICTING_STATIC_FACT');
  });
  test('a body mention does not turn an ordinary creature into a swarm',async()=>{
    const source=seed.source.replace('Actions\n','Traits\nSwarm Keeper. It can summon a swarm of Tiny beasts, or change a Small creature into a Huge creature.\nActions\n');
    const ir=await extract(source,seedCreature());
    expect(ir.creature.identity.swarmSize).toBeUndefined();
    expect(ir.creature.identity.size).toBe('medium');
    expect(ir.creature.identity.creatureType).toBe('construct');
    const invented=structuredClone(ir);invented.creature.identity.swarmSize='tiny';
    expect(auditMonsterIntakeSource(source,invented).blocking.some(finding=>finding.path==='/creature/identity/swarmSize')).toBe(true);
    expect(new YamlParser().parse(renderMonsterIntakeMarkdown(ir)).details.swarmSize).toBeUndefined();
  });
  test('a size word in the creature name is not a size declaration',async()=>{
    const source=seed.source.replace('Sentinel CR 2','Small Guardian CR 2'),value=seedCreature();value.identity.name='Small Guardian';
    const ir=await extract(source,value);expect(ir.creature.identity.size).toBe('medium');
  });
  test('an ordinary source rejects an invented member size before generation',()=>{
    const proposal=seedCreature();proposal.identity.swarmSize='tiny';
    expect(()=>facts(seed.source,proposal)).toThrow('identity/swarmSize');
  });
  test('an explicit independent Chinese member label does not overwrite overall size',()=>{
    const ir=facts(sourceWithIdentity('Size Medium\nType Beast\n集群个体体型：微型'));
    expect(ir.creature.identity.size).toBe('medium');expect(ir.creature.identity.swarmSize).toBe('tiny');
  });
  test('an unsupported extra type declaration cannot be hidden by a valid natural header',()=>{
    expect(()=>facts(sourceWithIdentity('Medium swarm of Tiny beasts\nType Unknown'))).toThrow('UNSUPPORTED_STATIC_FACT');
  });
  for(const second of ['中型小型野兽集群, unaligned','中型微型野兽集群, lawful good'])test('two Chinese identity rows cannot silently discard a conflict: '+second,async()=>{
    const identity='中型微型野兽集群, unaligned\n'+second,source=sourceWithIdentity(identity);
    expect(()=>facts(source)).toThrow('CONFLICTING_STATIC_FACT');
    const c:any=structuredClone(nativeCases.cases[0]);
    c.creature.identity={name:seed.creature.identity.name,size:'medium',creatureType:'beast',swarmSize:'tiny',alignment:'unaligned'};
    c.units[0].text=source.slice(0,source.indexOf('Actions\n'));
    c.source=c.units.map((unit:any)=>unit.text).join('');
    const result=await chain(c,()=>ordinary(c,modelReply(c)));
    expect(result.actor).toBeDefined();
    expect(auditMonsterIntakeSource(c.source,result.ir).findings).toContainEqual(expect.objectContaining({code:'SOURCE_CONFLICTING_STATIC_FACT'}));
  });
  test('an unclear swarm size is not guessed',()=>{
    expect(()=>facts(sourceWithIdentity('Size Medium (Swarm of Tiny or Small)\nType Beast'))).toThrow('UNSUPPORTED_STATIC_FACT');
  });
  test('a declared member size requires its own claim',async()=>{
    const source=sourceWithIdentity('Medium swarm of Tiny beasts, unaligned'),ir=await extract(source);
    ir.claims=ir.claims.filter(claim=>claim.path!=='/creature/identity/swarmSize');
    expect(auditMonsterIntakeSource(source,ir).blocking.some(finding=>finding.path==='/creature/identity/swarmSize')).toBe(true);
  });
  test('legacy YAML without the new optional key is unchanged',()=>{
    const parsed=new YamlParser().parse('---\n名称: Old Guard\n类型: npc\n体型: 中型\n生物类型: 构装生物\n---\n');
    expect(parsed.traits.size).toBe('med');expect(parsed.details.swarmSize).toBeUndefined();
  });
  test('invalid YAML member size retains its field finding and usable creature',()=>{
    const parsed=new YamlParser().parse('---\n名称: Bad Swarm\n类型: npc\n集群个体体型: unknown\n---\n');
    expect(parsed.name).toBe('Bad Swarm');expect(parsed.details.swarmSize).toBeUndefined();
    expect(parsed.candidateReview?.findings).toContainEqual(expect.objectContaining({code:'FIELD_PROJECTION_INCOMPLETE',path:'集群个体体型'}));
    expect((parsed.candidateReview?.proposal as any).value).toBe('unknown');
  });
});


describe('swarm native Actor projection through the public workflow',()=>{
  for(const row of [
    {identity:'Medium swarm of Tiny beasts, unaligned',type:'beast',size:'medium',member:'tiny',nativeMember:'tiny',nativeSize:'med',token:1},
    {identity:'Size Huge (Swarm of\nMedium)\nType Fiend (Yugoloth)',type:'fiend',size:'huge',member:'medium',nativeMember:'med',nativeSize:'huge',token:3},
    {identity:'大型虫群，由小型植物组成，无阵营',type:'plant',size:'large',member:'small',nativeMember:'sm',nativeSize:'lg',token:2},
  ] as const)test(row.identity.replaceAll('\n',' / '),async()=>{
    const source=sourceWithIdentity(row.identity),{ir,markdown,actor}=await actorChain(source,creature(row.type,row.size));
    expect(ir.creature.identity.swarmSize).toBe(row.member);
    expect(actor.system.details.type.swarm).toBe(row.nativeMember);
    expect(actor.system.details.type.value).toBe(row.type);
    expect(actor.system.traits.size).toBe(row.nativeSize);
    expect(actor.prototypeToken.width).toBe(row.token);
    expect(actor.prototypeToken.height).toBe(row.token);
    for(const value of [undefined,row.nativeMember==='tiny'?'sm':'tiny']){
      const changed=structuredClone(actor);
      if(value===undefined)delete changed.system.details.type.swarm;else changed.system.details.type.swarm=value;
      const findings=verifyMonsterIntake(source,ir,markdown,changed,request(source).candidate).findings.filter(finding=>finding.blocking);
      expect(findings.some(finding=>finding.code==='ACTOR_SWARM_SIZE_DRIFT')).toBe(true);
    }
    const wrongOverall=structuredClone(actor);wrongOverall.system.traits.size=row.nativeSize==='med'?'tiny':'med';
    expect(verifyMonsterIntake(source,ir,markdown,wrongOverall).findings.some(finding=>finding.blocking&&finding.code==='ACTOR_SIZE_DRIFT')).toBe(true);
  });
  test('ordinary Actor clears swarm identity inherited from an actual generated swarm template',async()=>{
    const swarmSource=sourceWithIdentity('Medium swarm of Tiny beasts, unaligned');
    const swarm=await actorChain(swarmSource,creature());
    const plain=await actorChain(seed.source,seedCreature());
    expect(plain.actor.system.details.type.swarm??'').toBe('');
    const parsed=new YamlParser().parse(plain.markdown);
    const generated=await new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null,resources:{goldenMaster:swarm.actor}}).generateForRoute(parsed,'chinese');
    expect(generated.system.details.type.swarm).toBe('');
    expect(generated.system.traits.size).toBe('med');
    expect(generated.prototypeToken.width).toBe(1);
    expect(generated.prototypeToken.height).toBe(1);
    expect(verifyMonsterIntake(seed.source,plain.ir,plain.markdown,generated).findings.filter(finding=>finding.blocking)).toEqual([]);
    const contaminated=structuredClone(plain.actor);contaminated.system.details.type.swarm='tiny';
    expect(verifyMonsterIntake(seed.source,plain.ir,plain.markdown,contaminated).findings.some(finding=>finding.blocking&&finding.code==='ACTOR_SWARM_SIZE_DRIFT')).toBe(true);
  });
});
