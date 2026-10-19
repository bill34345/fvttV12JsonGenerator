import {describe,expect,test} from 'bun:test';
import saved from './fixtures/forge-raw-contracts.json';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {normalizeMonsterSourceFacts} from '@fvtt-json-generator/intake-ai/source-facts';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {convertMarkdownContentToJson} from '@fvtt-json-generator/workflows';

async function fixture(caseId:string){
  const row=saved.find(row=>row.caseId===caseId)!;
  const ir=structuredClone(row.finalIr) as unknown as MonsterIntakeIR;
  normalizeMonsterSourceFacts(ir,row.source,{start:0,end:row.source.length});
  const markdown=renderMonsterIntakeMarkdown(ir);
  const generated=await convertMarkdownContentToJson({content:markdown,fvttVersion:'14',effectProfile:'core',translationService:null});
  expect(generated.rawJson).toBeDefined();
  return {source:row.source,ir,markdown,actor:generated.rawJson as any};
}
function findings(data:Awaited<ReturnType<typeof fixture>>){return verifyMonsterIntake(data.source,data.ir,data.markdown,data.actor).findings;}
function item(data:Awaited<ReturnType<typeof fixture>>,name:string){return data.actor.items.find((entry:any)=>entry.name===name);}

describe('source verifier preserves explicit literal branches without demanding unconditional native fields',()=>{
  for(const [caseId,name,path,number,denomination] of [
    ['baernaloths','Premonition of Pain','/creature/bonusActions/0',3,6],
    ['charon','Nothing for Nothing','/creature/legendaryActions/0',1,10],
  ] as const)test(caseId+' complete conditional damage remains blocked GM review, not claimed lost native damage',async()=>{
    const data=await fixture(caseId),actual=item(data,name);
    const initial=findings(data);
    expect(initial).toContainEqual(expect.objectContaining({code:'ACTOR_CONDITIONAL_DAMAGE_REQUIRES_GM',path:path+'/damage/0',blocking:true}));
    expect(initial.filter(f=>f.path.startsWith(path+'/damage/')&&['ACTOR_DAMAGE_FORMULA_DRIFT','ACTOR_DAMAGE_TYPE_DRIFT'].includes(f.code))).toEqual([]);
    expect(verifyMonsterIntake(data.source,data.ir,data.markdown,data.actor).status).toBe('needs_review');
    const withoutText=structuredClone(data);const omitted=item(withoutText,name);
    omitted.system.description.value='';for(const activity of Object.values(omitted.system.activities) as any[])activity.description={chatFlavor:''};
    expect(findings(withoutText).some(f=>f.code==='ACTOR_CONDITIONAL_DAMAGE_REQUIRES_GM'&&f.path.startsWith(path))).toBe(false);
    expect(findings(withoutText).some(f=>f.code==='ACTOR_DESCRIPTION_LOSS'&&f.path.startsWith(path))).toBe(true);
    const unsolicited=structuredClone(data);const first=Object.values(item(unsolicited,name).system.activities)[0] as any;
    first.damage={parts:[{number,denomination,bonus:'',types:[caseId==='charon'?'necrotic':'psychic'],custom:{enabled:false,formula:''}}]};
    expect(findings(unsolicited)).toContainEqual(expect.objectContaining({code:'ACTOR_CONDITIONAL_DAMAGE_DRIFT',path:path+'/damage/0',blocking:true}));
    first.damage.parts[0]={number:2,denomination:6,bonus:'',types:['fire'],custom:{enabled:false,formula:''}};
    expect(findings(unsolicited)).toContainEqual(expect.objectContaining({code:'ACTOR_CONDITIONAL_DAMAGE_DRIFT',path:path+'/damage/0',blocking:true}));
    expect(Object.values(actual.system.activities).flatMap((a:any)=>a.damage?.parts??[])).toEqual([]);
  });
  test('source-proved0HP save is GM-only; wrong DC, missing full source and unconditional Save stay blocked',async()=>{
    const data=await fixture('baernaloths'),path='/creature/actions/1';
    expect(findings(data)).toContainEqual(expect.objectContaining({code:'ACTOR_CONDITIONAL_SAVE_REQUIRES_GM',path:path+'/save',blocking:true}));
    expect(findings(data).filter(f=>f.path.startsWith(path+'/save/')&&['ACTOR_SAVE_DC_DRIFT','ACTOR_SAVE_ABILITY_DRIFT'].includes(f.code))).toEqual([]);
    const wrong=structuredClone(data);wrong.ir.creature.actions[1]!.save!.dc=21;
    expect(findings(wrong).some(f=>f.code==='ACTOR_CONDITIONAL_SAVE_REQUIRES_GM'&&f.path===path+'/save')).toBe(false);
    expect(findings(wrong).some(f=>f.code==='ACTOR_SAVE_DC_DRIFT'&&f.path===path+'/save/dc')).toBe(true);
    const missing=structuredClone(data);missing.ir.coverage=missing.ir.coverage.filter(c=>!c.claimPaths.includes(path));
    expect(findings(missing).some(f=>f.code==='ACTOR_CONDITIONAL_SAVE_REQUIRES_GM'&&f.path===path+'/save')).toBe(false);
    const immediate=structuredClone(data);const attack=Object.values(item(immediate,'Deranging Touch').system.activities)[0] as any;
    attack.save={ability:['cha'],dc:{calculation:'',formula:'20'}};
    expect(findings(immediate)).toContainEqual(expect.objectContaining({code:'ACTOR_CONDITIONAL_SAVE_DRIFT',path:path+'/save',blocking:true}));
    const extra=structuredClone(data);
    item(extra,'Deranging Touch').system.activities['test-authored-extra-save']={type:'save',save:{ability:['cha'],dc:{calculation:'',formula:'20'}}};
    expect(findings(extra)).toContainEqual(expect.objectContaining({code:'ACTOR_CONDITIONAL_SAVE_DRIFT',path:path+'/save',blocking:true}));
  });
});
