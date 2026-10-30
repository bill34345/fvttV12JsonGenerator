import {describe,test,expect} from 'bun:test';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {runStagedMonsterExtraction} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {OpenAICompatibleMonsterIntakeProvider} from '@fvtt-json-generator/intake-ai/provider';
import {anchorIrEvidence} from '@fvtt-json-generator/intake-ai/orchestrator';
import {auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import {validateSourceBaseNumbers} from '../packages/intake-ai/src/base-source-numbers';
import {validateStagedStaticSourceFacts} from '../packages/intake-ai/src/staged-source-facts';
import data from './fixtures/forge-statblock-semantic-cases.json';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows/single-file-conversion';
import {headerPresentation} from '../packages/intake-ai/src/header-presentation';

const request=(source:string)=>({source,sourceSha256:hashSource(source),candidate:{id:'semantic-regression',label:'Semantic regression',start:0,end:source.length,quote:source}});
async function correct(source:string,creature:unknown){return runStagedMonsterExtraction(request(source),async call=>{await call.onAttempt(1);return{schemaVersion:1,creature:structuredClone(creature),uncertainties:[]};},{baseMode:'facts',featureMode:'source'});}
async function ordinary(source:string,raw:unknown){
  const provider=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'offline',baseUrl:'https://offline.invalid/v1',model:'test',reviewModel:'test',maxAttempts:1,timeoutMs:10000,repairTimeoutMs:10000,httpClient:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(raw)}}]})})});
  return anchorIrEvidence(source,request(source).candidate,await provider.extract(request(source)));
}
const leaf=(object:any,path:string[])=>path.reduce((value,key)=>value?.[key],object);
function change(object:any,path:string[],value:unknown){const parent=path.slice(0,-1).reduce((value,key)=>value[key],object);parent[path.at(-1)!]=structuredClone(value);}
describe('source facts across ordinary and staged stat blocks',()=>{
  const seed=data.seeds[1]!;
  for(const mutation of data.mutations)test('ordinary retains '+mutation.id+' and source audit diagnoses its conflict',async()=>{
    const ir=await correct(seed.source,seed.creature);
    change(ir.creature,mutation.path,mutation.value);const result=await ordinary(seed.source,ir);
    const blocked=auditMonsterIntakeSource(seed.source,result,{coverageRange:request(seed.source).candidate}).blocking;
    expect(leaf(result.creature,mutation.path)).toEqual(mutation.value);expect(blocked.length).toBeGreaterThan(0);
  });
  for(const[field,value]of[[['attack','toHit'],9],[['attack','range'],300],[['attack','longRange'],600],[['activationType'],'reaction']] as Array<[string[],unknown]>)test('ordinary simple attack keeps source '+field.join('/'),async()=>{
    const ir=await correct(seed.source,seed.creature);change(ir.creature.actions[0],field,value);
    const result=await ordinary(seed.source,ir);
    expect(auditMonsterIntakeSource(seed.source,result).blocking.length).toBeGreaterThan(0);
  });
  test.each(['\n','\r\n'])('fullwidth stat headers retain exact original evidence (%j)',async newline=>{
    const at=seed.source.indexOf('Actions\n');
    const source=(seed.source.slice(0,at).replace(/[0-9()+]/gu,char=>String.fromCharCode(char.charCodeAt(0)+0xfee0))+seed.source.slice(at)).replaceAll('\n',newline);
    const ir=await correct(source,seed.creature);
    expect(auditMonsterIntakeSource(source,ir).blocking).toEqual([]);
    expect(ir.coverage.map(ref=>ref.quote).join('')).toBe(source);
    for(const ref of ir.claims.flatMap(claim=>claim.evidence))expect(source.slice(ref.start,ref.end)).toBe(ref.quote);
  });
  test.each(['CR 0.5','Challenge 0.5','challenge: 0.5'])('decimal challenge is a complete number: %s',async label=>{
    const source=seed.source.replace('CR 1/2',label);
    const ir=await correct(seed.source,seed.creature);
    expect(()=>validateSourceBaseNumbers(source,ir,false)).not.toThrow();
    ir.creature.attributes.cr=0;
    expect(()=>validateSourceBaseNumbers(source,ir,false)).toThrow('BASE_NUMBER_CONFLICT');
  });
  test('an unknown table layout cannot hide an independently readable wrong HP formula',async()=>{
    const ir=await correct(seed.source,seed.creature);
    const source=seed.source.replace(/STR 8 DEX 14 CON 12 INT 11 WIS 16 CHA 13/u,'STR DEX CON INT WIS CHA\n8 14 12 [unfamiliar-cell] 16 13');
    ir.creature.attributes.hp.formula='9d12';
    expect(()=>validateSourceBaseNumbers(source,ir,false)).toThrow('BASE_FORMULA_CONFLICT');
    ir.source={sha256:hashSource(source),length:source.length};
    expect(auditMonsterIntakeSource(source,ir).blocking).toContainEqual(expect.objectContaining({code:'SOURCE_BASE_FORMULA_CONFLICT',path:'/creature/attributes/hp/formula'}));
  });
  test('an unfamiliar skill spelling cannot hide an independently readable wrong sense',async()=>{
    const ir=await correct(seed.source,seed.creature),source=seed.source.replace('Skills Perception +5','Skills Unknown Lore +5');
    expect(()=>validateStagedStaticSourceFacts(source,ir.creature,'skills')).toThrow('UNSUPPORTED_STATIC_FACT');
    ir.creature.senses.darkvision=120;
    expect(()=>validateStagedStaticSourceFacts(source,ir.creature,'senses')).toThrow('BASE_STATIC_CONFLICT');
    ir.source={sha256:hashSource(source),length:source.length};
    expect(auditMonsterIntakeSource(source,ir).blocking).toContainEqual(expect.objectContaining({code:'SOURCE_BASE_STATIC_CONFLICT',path:'/creature/senses'}));
  });
});

describe('optional HP formulas in rendered HTML-entity table cells',()=>{
  const seed=data.seeds[1]!;
  const cases=[
    {row:'| **HP&#x20;**&#x37;（3d4） |',hp:{value:7,formula:'3d4'}},
    {row:'| **HP&#32;**&#50;&#50; (5d6 + 5) |',hp:{value:22,formula:'5d6 + 5'}},
    {row:'| **HP&#X20;**35&#xFF08;10d4 + 10&#xFF09; |',hp:{value:35,formula:'10d4 + 10'}},
    {row:'| **HP&#x20;**&#x37; |',hp:{value:7}},
  ];
  for(const c of cases)for(const newline of ['\n','\r\n'])test(`${c.row} (${JSON.stringify(newline)}) preserves source and formal Actor HP`,async()=>{
    const source=seed.source.replace('HP 22 (5d6 + 5) Size Small',`${c.row}\n| ----------------------- |\nSize Small`).replaceAll('\n',newline);
    const creature=structuredClone(seed.creature);creature.attributes.hp=c.hp as typeof creature.attributes.hp;
    const ir=await correct(source,creature);
    expect(auditMonsterIntakeSource(source,ir).blocking).toEqual([]);
    expect(ir.coverage.map(ref=>ref.quote).join('')).toBe(source);
    for(const ref of ir.claims.flatMap(claim=>claim.evidence))expect(source.slice(ref.start,ref.end)).toBe(ref.quote);
    const markdown=renderMonsterIntakeMarkdown(ir),output=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',iconOptions:{mode:'off'},translationService:null});
    expect(verifyMonsterIntake(source,ir,markdown,output.rawJson).status).toBe('accepted');
    expect(output.rawJson).toMatchObject({system:{attributes:{hp:{value:c.hp.value,max:c.hp.value,formula:c.hp.formula??''}}}});
    const wrong=structuredClone(ir);wrong.creature.attributes.hp.formula=c.hp.formula?'9d12': '3d4';
    expect(auditMonsterIntakeSource(source,wrong).blocking).toContainEqual(expect.objectContaining({path:'/creature/attributes/hp/formula'}));
    if(c.hp.formula){delete wrong.creature.attributes.hp.formula;expect(auditMonsterIntakeSource(source,wrong).blocking).toContainEqual(expect.objectContaining({code:'SOURCE_BASE_FORMULA_CONFLICT'}));}
    wrong.creature.attributes.hp.value=99;
    expect(auditMonsterIntakeSource(source,wrong).blocking).toContainEqual(expect.objectContaining({code:'SOURCE_BASE_NUMBER_CONFLICT',path:'/creature/attributes/hp/value'}));
  });
  test('a later damage formula cannot supply an absent HP formula',async()=>{
    const source=seed.source.replace('HP 22 (5d6 + 5)','HP 22'),creature=structuredClone(seed.creature);
    delete (creature.attributes.hp as {formula?:string}).formula;
    const ir=await correct(source,creature);expect(auditMonsterIntakeSource(source,ir).blocking).toEqual([]);
    expect(ir.creature.attributes.hp.formula).toBeUndefined();
    ir.creature.attributes.hp.formula='1d4 + 2';
    expect(auditMonsterIntakeSource(source,ir).blocking).toContainEqual(expect.objectContaining({path:'/creature/attributes/hp/formula'}));
  });
  test('numeric entity decoding is single-pass and leaves invalid/control references literal',()=>{
    for(const reference of ['&#0;','&#10;','&#xD800;','&#x110000;'])expect(headerPresentation(reference)).toBe(reference);
    expect(headerPresentation('&#38;#x37;')).toBe('&#x37;');
    expect(headerPresentation('HP &#0000055;（3d4）')).toBe('HP 7(3d4)');
  });
});
