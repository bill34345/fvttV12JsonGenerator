import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {OpenAICompatibleMonsterIntakeProvider,INTAKE_PROMPT_VERSIONS} from '@fvtt-json-generator/intake-ai/provider';
import {MONSTER_EXTRACT_PROMPT,MONSTER_REPAIR_PROMPT} from '../packages/intake-ai/src/monster-prompts';
import {analyzeBrowserActorIntakeDraft,analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {hashSource,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {buildValidLurkerIr,LURKER_SOURCE} from '../src/core/intake/__tests__/fixtures/lurker';
import type {SourceOperation} from '@fvtt-json-generator/models/source-operations';

const stop=async():Promise<never>=>{throw Error('No model service request is permitted');};
const provider={providerName:'condition-dc-contract',extractionModel:'frozen',reviewModel:'disabled',discover:stop,extract:stop,review:stop,repair:stop};
const input=(source:string)=>({source,sourceName:'condition DC roles',sourceScope:'single' as const,sourceId:'actor:v1:71ebf592-2eb2-4af3-ad27-f55d86892814' as ForgeSourceId,requestId:'condition-dc-roles',fvttVersion:'14.368',systemVersion:'5.3.3'});
async function project(source:string,op:SourceOperation){
  const ir=buildValidLurkerIr();ir.claims=[];ir.coverage=[];
  ir.creature.traits=[{name:'Condition DC Roles',description:op.sourceText,activationType:'special',sourceOperations:[op]}];
  const before=structuredClone(ir),args=input(source),analysis=analyzeBrowserActorIntakeDraft(args,ir,provider);
  const generated=await generateBrowserActorIntakeCandidate(args,analysis,provider);
  expect(generated.candidateAvailable).toBe(true);expect(ir).toEqual(before);
  return generated.actorProjection as any;
}
describe('condition DC roles retain AI-owned mechanics without a new rejection',()=>{
  test('extraction and explicit repair prompts distinguish escape checks from repeated saves',()=>{
    expect(INTAKE_PROMPT_VERSIONS.extract).toBe('monster-intake-extract-v54-prompt-consolidation');
    expect(INTAKE_PROMPT_VERSIONS.repair).toBe('monster-intake-repair-v44-prompt-consolidation');
    for(const prompt of [MONSTER_EXTRACT_PROMPT,MONSTER_REPAIR_PROMPT]){
      expect(prompt).toContain('A repeated saving throw, including a save that ends a condition, is not an escape check');
      expect(prompt).toContain('Never copy a save DC into escapeDc');
      expect(prompt).toContain('If both kinds occur, retain their distinct DCs and rules');
      expect(prompt).toContain('Do not discard supported attacks/saves/damage/heals or resource counters');
    }
  });
  test('repeat-save state retains its DC and timing without adding an escape DC',async()=>{
    const text='Constitution Saving Throw: DC 13. Failure: Restrained. The target repeats the save at the end of its next turn, ending the effect on a success.';
    const actor=await project(LURKER_SOURCE+'\n'+text,{id:'repeat-save',name:'Repeat Save',type:'save',relationship:'primary',sourceText:text,save:{dc:13,abilities:['con'],choice:'single',outcome:'none'},appliedConditions:[{statuses:['restrained'],duration:'until the end of its next turn; repeat the Constitution save, ending on success',staged:true}],proof:{save:text}});
    const item=actor.items.find((i:any)=>i.name==='Condition DC Roles'),activity=Object.values<any>(item.system.activities)[0];
    expect(activity.save).toMatchObject({ability:['con'],dc:{formula:'13'}});
    expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle.escapeDc).toBeUndefined();
    expect(item.effects[0].description).not.toContain('逃脱 DC');
  });
  test('explicit grapple escape DC remains a separate supported parameter',async()=>{
    const text='The target has the Grappled condition (escape DC 15).';
    const actor=await project(LURKER_SOURCE+'\n'+text,{id:'grapple',name:'Grapple',type:'attack',relationship:'primary',sourceText:text,attack:{type:'mwak',toHit:6,reach:5},damage:[],appliedConditions:[{statuses:['grappled'],escapeDc:15}],proof:{attack:text}});
    const item=actor.items.find((i:any)=>i.name==='Condition DC Roles');
    expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle.escapeDc).toBe(15);
    expect(item.effects[0].description).toContain('逃脱 DC 15');
  });
  test('a source-declared escape DC may coexist with a different repeat-save DC',async()=>{
    const text='Wisdom Saving Throw: DC 13. Failure: Restrained (escape DC 17). The target repeats the save at the end of its next turn.';
    const actor=await project(LURKER_SOURCE+'\n'+text,{id:'both',name:'Both DC Roles',type:'save',relationship:'primary',sourceText:text,save:{dc:13,abilities:['wis'],choice:'single',outcome:'none'},appliedConditions:[{statuses:['restrained'],escapeDc:17,duration:'repeat the save at the end of its next turn'}],proof:{save:text}});
    const item=actor.items.find((i:any)=>i.name==='Condition DC Roles');
    expect(Object.values<any>(item.system.activities)[0].save.dc.formula).toBe('13');expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle.escapeDc).toBe(17);
  });
  test('unchanged frozen mistaken Medusa reply remains visible and is never silently corrected or retried',async()=>{
    const root=process.env.FORGE_MORE_FRESH_ROOT;if(!root)throw Error('FORGE_MORE_FRESH_ROOT must point to frozen first answers');
    const source=readFileSync(join(root,'sources/medusa/source.md'),'utf8'),raw=readFileSync(join(root,'results/medusa/raw-answer.txt'),'utf8');
    const old=JSON.parse(readFileSync(join(root,'results/medusa/actor.json'),'utf8'));let calls=0;const captured:string[]=[];const requests:any[]=[];
    const p=new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:'frozen-only',baseUrl:'https://offline.invalid',model:'frozen',reviewModel:'disabled',maxAttempts:1,timeoutMs:1000,repairTimeoutMs:1000,httpClient:async(_url,request)=>{requests.push(JSON.parse(String(request.body)));calls++;return Response.json({choices:[{message:{content:raw}}]});},responseEvidence:{record:e=>{captured.push(e.content);}}});
    const allowed={...provider,extract:p.extract.bind(p),extractAnswer:p.extractAnswer.bind(p)};
    const args=input(source),analysis=await analyzeBrowserActorSourceWithAi(args,allowed),generated=await generateBrowserActorIntakeCandidate(args,analysis,provider);
    expect(calls).toBe(1);expect(captured).toEqual([raw]);expect(requests[0].messages[0].content).toContain('Never copy a save DC into escapeDc');
    expect(analysis.ir!.creature.bonusActions[0]!.sourceOperations![0]!.appliedConditions![0]!.escapeDc).toBe(13);
    const actor=generated.actorProjection as any;actor._stats.createdTime=old._stats.createdTime;actor._stats.modifiedTime=old._stats.modifiedTime;
    expect(actor).toEqual(old);expect(generated.candidateAvailable).toBe(true);
  });
});
