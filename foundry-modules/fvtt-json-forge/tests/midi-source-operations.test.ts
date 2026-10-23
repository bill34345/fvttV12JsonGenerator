import {beforeAll,describe,expect,test} from 'bun:test';
import {buildForgeActorRequest,convertFinalActorSource} from '@fvtt-json-generator/forge-browser-runtime';
import {hashArtifact,hashSource,type ForgeActorResponse} from '@fvtt-json-generator/forge-gateway-protocol';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {encounterFixture} from '../../../tests/helpers/forge-encounter';
import recorded from '../../../tests/fixtures/forge-recorded-contract-protocol-failures.json';
import native from './fixtures/midi-independent-source-operations.json';
import {assertActorSemantics,createAcceptedForgeActor,prepareFoundryImportArtifact} from '../src/runtime';
import {importForgeEncounter} from '../src/encounterRuntime';

const formalSource=recorded.nativeActivitySchema.formalSource;
let response:ForgeActorResponse,artifact:any;
beforeAll(async()=>{response=await convertFinalActorSource(buildForgeActorRequest({content:formalSource,displayName:'Independent source operations',requestId:'midi-independent-source',fvttVersion:'14.364',systemVersion:'5.3.3'}));if(!('result'in response)||response.result.status!=='accepted')throw Error('Formal source did not generate an accepted Actor');artifact=response.result.artifact;});
const activities=(actor:any)=>actor.items.flatMap((item:any)=>Object.values(item.system?.activities??{})).filter((activity:any)=>activity.flags?.fvttJsonGenerator?.sourceOperation) as any[];
const moduleState=(version='14.0.11',active=true)=>({get:(id:string)=>id==='midi-qol'?{active,version}:undefined});
function runtime(version:string|undefined='14.0.11',drift?:(data:any)=>void){
  function collection(kind:string){const docs=new Map<string,any>();const api={createCount:0,deleteCount:0,get:(id:string)=>docs.get(id),get contents(){return[...docs.values()];},documentClass:{async create(data:any){api.createCount++;const copy=structuredClone(data);drift?.(copy);const doc:any={id:copy._id,uuid:kind+'.'+copy._id,name:copy.name,data:copy,get flags(){return this.data.flags;},toObject(){return structuredClone(this.data);},async update(changes:Record<string,unknown>){for(const[path,value]of Object.entries(changes)){const parts=path.split('.');let owner=this.data;for(const key of parts.slice(0,-1))owner=owner[key]??={};owner[parts.at(-1)!]=value;}return this;},async delete(){api.deleteCount++;docs.delete(this.id);}};docs.set(doc.id,doc);return doc;}}};return api;}
  const game={version:'14.364',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},actors:collection('Actor'),macros:collection('Macro'),...(version?{modules:moduleState(version)}:{})};
  return{game,assets:{async ensure(){throw Error('No assets in this fixture');}}};
}

describe('locked Midi independent source-operation import adapter',()=>{
  test('the actual010 unsafe defaults fail strict readback; the import copy blocks every independent chain',()=>{
    expect(native.midiVersion).toBe('14.0.11');const unsafe=structuredClone(artifact);
    for(const row of native.rows){const item=unsafe.items.find((item:any)=>item.flags?.fvttJsonGenerator?.manualRule?.logicalPath===row.logicalPath);expect(item).toBeDefined();const activity=Object.values(item.system.activities).find((activity:any)=>activity.flags?.fvttJsonGenerator?.sourceOperation?.id===row.operationId) as any;expect(activity.type).toBe(row.type);activity.midiProperties=structuredClone(row.midiProperties);if('otherActivityId'in row)activity.otherActivityId=row.otherActivityId;}
    expect(()=>assertActorSemantics(artifact,unsafe)).toThrow('Midi safety');
    const before=JSON.stringify(artifact),hash=hashArtifact(artifact),adapted=prepareFoundryImportArtifact(artifact,{modules:moduleState()}) as any;
    expect(JSON.stringify(artifact)).toBe(before);expect(hashArtifact(artifact)).toBe(hash);
    for(const activity of activities(adapted)){expect(activity.midiProperties).toEqual({otherActivityCompatible:false,triggeredActivityId:'none',...(activity.type==='save'&&activity.damage?.parts?.length?{removeChatButtons:'none'}:{})});if(activity.type==='attack')expect(activity.otherActivityId).toBe('none');else expect(activity.otherActivityId).toBeUndefined();}
    expect(()=>assertActorSemantics(adapted,structuredClone(adapted))).not.toThrow();
    expect(activities(adapted).map(activity=>activity.consumption)).toEqual(activities(artifact).map(activity=>activity.consumption));expect(adapted.flags['fvtt-json-generator-spell-resolver']).toEqual(artifact.flags['fvtt-json-generator-spell-resolver']);
  });
  test('missing safety values, explicit default restoration and injected trigger/other IDs are rejected',()=>{
    const expected=prepareFoundryImportArtifact(artifact,{modules:moduleState()}) as any;
    for(const mutate of [(a:any)=>{activities(a)[0].midiProperties.otherActivityCompatible=true;},(a:any)=>{delete activities(a)[0].midiProperties.otherActivityCompatible;},(a:any)=>{delete activities(a)[0].midiProperties;},(a:any)=>{activities(a)[0].midiProperties.triggeredActivityId='other';},(a:any)=>{delete activities(a)[0].midiProperties.triggeredActivityId;},(a:any)=>{activities(a).find(activity=>activity.type==='attack').otherActivityId='';},(a:any)=>{delete activities(a).find(activity=>activity.type==='attack').otherActivityId;},(a:any)=>{activities(a).find(activity=>activity.type==='save').otherActivityId='other';}]){const changed=structuredClone(expected);mutate(changed);expect(()=>assertActorSemantics(expected,changed)).toThrow('Midi safety');}
  });
  test('no Midi leaves pure core; unknown active versions fail before creation',async()=>{
    const plain=prepareFoundryImportArtifact(artifact) as any,inactive=prepareFoundryImportArtifact(artifact,{modules:moduleState('unverified',false)}) as any;
    expect(activities(plain).every(activity=>activity.midiProperties===undefined&&activity.otherActivityId===undefined)).toBe(true);expect(inactive).toEqual(plain);
    const absent=runtime('');await createAcceptedForgeActor({game:absent.game,response});expect(activities(absent.game.actors.contents[0].data).every(activity=>activity.midiProperties===undefined&&activity.otherActivityId===undefined)).toBe(true);
    const env=runtime('14.0.12');await expect(createAcceptedForgeActor({game:env.game,response})).rejects.toThrow('unverified Midi version');expect(env.game.actors.createCount).toBe(0);
  });
  test('mixed source Save keeps its damage button and rejects missing or restored hidden-button defaults',()=>{
    const before=JSON.stringify(artifact),adapted=prepareFoundryImportArtifact(artifact,{modules:moduleState()}) as any;
    const save=activities(adapted).find(activity=>activity.type==='save'&&activity.damage?.parts?.length);
    expect(save).toBeDefined();expect(save.midiProperties.removeChatButtons).toBe('none');
    expect(JSON.stringify(artifact)).toBe(before);
    // Import changes neither the configured native dice nor consumption; the
    // ordinary GM action rolls them. It cannot silently become automatic HP.
    const original=activities(artifact).find(activity=>activity._id===save._id);
    expect(save.damage).toEqual(original.damage);expect(save.consumption).toEqual(original.consumption);
    for(const value of [undefined,'default','all','damage','everything']){
      const wrong=structuredClone(adapted),activity=activities(wrong).find(activity=>activity._id===save._id);
      if(value===undefined)delete activity.midiProperties.removeChatButtons;else activity.midiProperties.removeChatButtons=value;
      expect(()=>assertActorSemantics(adapted,wrong)).toThrow('Midi safety');
    }
    const unrelated=structuredClone(artifact);for(const item of unrelated.items){delete item.flags?.fvttJsonGenerator?.manualRule;for(const activity of Object.values<any>(item.system?.activities??{})){delete activity.flags?.fvttJsonGenerator?.sourceOperation;}}
    const plain=prepareFoundryImportArtifact(unrelated,{modules:moduleState()}) as any;
    expect(plain).toEqual(unrelated);
  });
  test('an unbound Activity marker cannot receive a guessed compatibility adapter',()=>{const changed=structuredClone(artifact);activities(changed)[0].flags.fvttJsonGenerator.sourceOperation.relationship='follow-up';expect(()=>prepareFoundryImportArtifact(changed,{modules:moduleState()})).toThrow('Unbound source-operation');});
  test('source-line boundary newlines keep bindings while changed operation text still fails before import',()=>{
    const candidate=structuredClone(artifact);
    for(const item of candidate.items){const rule=item.flags?.fvttJsonGenerator?.manualRule;if(rule?.sourceOperations)rule.sourceText='\n'+rule.sourceText.trim()+'\n';}
    const before=JSON.stringify(candidate),adapted=prepareFoundryImportArtifact(candidate,{modules:moduleState()});
    expect(JSON.stringify(candidate)).toBe(before);
    expect(activities(adapted).every(activity=>activity.midiProperties.otherActivityCompatible===false&&activity.midiProperties.triggeredActivityId==='none')).toBe(true);
    for(const layer of ['operation','marker']){
      const wrong=structuredClone(candidate),item=wrong.items.find((entry:any)=>entry.flags?.fvttJsonGenerator?.manualRule?.sourceOperations);
      if(layer==='operation')item.flags.fvttJsonGenerator.manualRule.sourceOperations[0].sourceText+=' Different source rule.';
      else activities(wrong)[0].flags.fvttJsonGenerator.sourceOperation.sourceText+=' Different source rule.';
      expect(()=>prepareFoundryImportArtifact(wrong,{modules:moduleState()})).toThrow('Unbound source-operation');
    }
  });
  test('normal single-Actor creation and reuse keep safety and reject an unsafe existing card without migration',async()=>{
    const env=runtime(),before=hashArtifact(artifact),created=await createAcceptedForgeActor({game:env.game,response});expect(created.status).toBe('created');expect((await createAcceptedForgeActor({game:env.game,response})).status).toBe('existing');expect(env.game.actors.createCount).toBe(1);expect(hashArtifact(artifact)).toBe(before);
    const existing=env.game.actors.contents[0],activity=activities(existing.data).find(activity=>activity.type==='attack');activity.otherActivityId='';const original=JSON.stringify(existing.data);
    await expect(createAcceptedForgeActor({game:env.game,response})).rejects.toThrow('new Forge source/package identity');expect(JSON.stringify(existing.data)).toBe(original);expect(env.game.actors.createCount).toBe(1);expect(env.game.actors.deleteCount).toBe(0);
  });
  test('a changed native safety field rolls back only the newly created Actor',async()=>{const env=runtime('14.0.11',data=>{activities(data)[0].midiProperties.otherActivityCompatible=true;});await expect(createAcceptedForgeActor({game:env.game,response})).rejects.toThrow('Midi safety');expect(env.game.actors.createCount).toBe(1);expect(env.game.actors.deleteCount).toBe(1);expect(env.game.actors.contents).toHaveLength(0);});
  test('Encounter import, all preflight conflicts and reuse use the same safety contract',async()=>{
    const bundle:any=encounterFixture();bundle.id='midi-independent-encounter';bundle.actors=[{key:'main',label:'Independent operations',source:formalSource,sourceHash:hashSource(formalSource)}];bundle.macros=[];const prepared=await prepareForgeEncounter(JSON.stringify(bundle)),sealed=JSON.stringify(prepared);
    const unknown=runtime('14.0.12');await expect(importForgeEncounter({...unknown,prepared,reviewed:true})).rejects.toThrow('unverified Midi version');expect(unknown.game.actors.createCount).toBe(0);expect(unknown.game.macros.createCount).toBe(0);
    const env=runtime(),created=await importForgeEncounter({...env,prepared,reviewed:true});expect(created.documents[0]!.status).toBe('created');expect((await importForgeEncounter({...env,prepared,reviewed:true})).documents[0]!.status).toBe('existing');expect(JSON.stringify(prepared)).toBe(sealed);
    const existing=env.game.actors.contents[0],activity=activities(existing.data).find(activity=>activity.type==='damage');activity.midiProperties.otherActivityCompatible=true;const original=JSON.stringify(existing.data);await expect(importForgeEncounter({...env,prepared,reviewed:true})).rejects.toThrow('Midi safety');expect(JSON.stringify(existing.data)).toBe(original);expect(env.game.actors.createCount).toBe(1);expect(env.game.actors.deleteCount).toBe(0);
  });
});
