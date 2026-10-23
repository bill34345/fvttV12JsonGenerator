import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { hashEncounterBytes } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { encounterFixture, assistedEncounterFixture } from '../../../tests/helpers/forge-encounter';
import { createEncounterAssetPort, importForgeEncounter, startForgeEncounterMacro, listForgeEncounterMacros, encounterDocumentId, type EncounterGame } from '../src/encounterRuntime';

function runtime() {
  let executions=0;
  function collection(kind:string) {
    const docs=new Map<string,any>();
    const api:any={get:(id:string)=>docs.get(id),get contents(){return [...docs.values()];},fail:false,cancel:false,cancelDelete:false,deleteAttempts:0,overrideId:null,createCount:0,
      documentClass:{async create(data:any){api.createCount++;if(api.fail)throw Error('fixture create failure');if(api.cancel)return undefined;data={...data,_id:api.overrideId??data._id};if(docs.has(data._id))throw Error('duplicate');
        const doc:any={id:data._id,uuid:`${kind}.${data._id}`,name:data.name,data:structuredClone(data),toObject(){return structuredClone(this.data);},async delete(){api.deleteAttempts++;if(api.cancelDelete)return undefined;docs.delete(this.id);return this;},async execute(){executions++;}};docs.set(doc.id,doc);return doc;}}};return api;
  }
  const game:any={version:'14.364',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},actors:collection('Actor'),macros:collection('Macro')};
  return {game:game as EncounterGame,get executions(){return executions;},assets:{async ensure(){throw Error('Unexpected asset upload');}}};
}
async function ready(){return prepareForgeEncounter(JSON.stringify(encounterFixture()));}
describe('reviewed encounter import and explicit macro startup',()=>{
  test('materializes only missing native NPC artwork without mutating the reviewed artifact',async()=>{
    const env=runtime(),prepared=await ready(),before=JSON.stringify(prepared);
    const result=await importForgeEncounter({...env,prepared,reviewed:true});
    for(const row of result.documents.filter(d=>d.kind==='Actor')){
      const actual=env.game.actors.get(row.id)!.toObject();const source=prepared.actors.find(a=>a.key===row.key)!.artifact as any;
      expect(actual.img).toBe(source.img||'systems/dnd5e/icons/svg/actors/npc.svg');
      expect(actual.prototypeToken.texture.src).toBe(source.prototypeToken?.texture?.src||actual.img);
    }
    expect(JSON.stringify(prepared)).toBe(before);
  });
  test('reports unexpected artwork replacement and retains the created Actor',async()=>{
    const env=runtime(),prepared=await ready(),create=env.game.actors.documentClass.create;
    env.game.actors.documentClass.create=async(data:any)=>{const doc=await create(data);(doc as any).data.img='unrelated.png';return doc;};
    const result=await importForgeEncounter({...env,prepared,reviewed:true});
    expect(result.documents.flatMap(d=>d.readbackWarnings??[]).join(' ')).toContain('图片');
    expect(env.game.actors.contents).toHaveLength(prepared.actors.length);
  });
  test('accepts native numeric FormulaField strings and reports changed movement',async()=>{
    for(const drift of [false,true]){
      const env=runtime(),prepared=await prepareForgeEncounter(JSON.stringify(assistedEncounterFixture()));
      const create=env.game.actors.documentClass.create;
      env.game.actors.documentClass.create=async(data:any)=>{
        expect(data.system.skills.value).toBeUndefined();
        for(const key of ['walk','burrow','climb','fly','swim','bonus']){
          const value=data.system.attributes.movement[key];
          if(typeof value==='number')data.system.attributes.movement[key]=String(value);
          if(value===null)delete data.system.attributes.movement[key];
        }
        data.system.attributes.init.bonus=String(data.system.attributes.init.bonus);
        if(drift)data.system.attributes.movement.walk='999';
        return create(data);
      };
      if(drift){const result=await importForgeEncounter({...env,prepared,reviewed:true});expect(result.documents.flatMap(d=>d.readbackWarnings??[]).join(' ')).toContain('movement.walk');expect(env.game.actors.contents?.length).toBeGreaterThan(0);}
      else expect((await importForgeEncounter({...env,prepared,reviewed:true})).documents).toHaveLength(3);
    }
  });
  test('allows native in-place flag cleaning without mutating the sealed preparation',async()=>{
    const env=runtime(),prepared=await prepareForgeEncounter(JSON.stringify(assistedEncounterFixture()));
    const original=JSON.stringify(prepared);
    const create=env.game.macros.documentClass.create;
    env.game.macros.documentClass.create=async(data:any)=>{
      const identity=data.flags['fvtt-json-forge'].encounter;
      identity.covers[0]={...identity.covers[0]};
      identity.bindingKeys.dragon=identity.bindingKeys.dragon.trim();
      return create(data);
    };
    const result=await importForgeEncounter({...env,prepared,reviewed:true});
    expect(result.documents).toHaveLength(3);expect(JSON.stringify(prepared)).toBe(original);
    expect(env.executions).toBe(0);
  });
  test('reports exact remaining UUIDs and attempts every cleanup when preDelete cancels',async()=>{
    const env=runtime(),prepared=await ready();(env.game.macros as any).fail=true;(env.game.actors as any).cancelDelete=true;
    let failure='';try{await importForgeEncounter({...env,prepared,reviewed:true});}catch(error){failure=(error as Error).message;}
    expect(env.game.actors.contents).toHaveLength(2);expect((env.game.actors as any).deleteAttempts).toBe(2);
    for(const actor of env.game.actors.contents!)expect(failure).toContain(actor.uuid);expect(failure).toContain('无法清理');
  });
  test('cleans the exact newly returned document if Foundry does not preserve its requested ID',async()=>{
    const env=runtime(),prepared=await ready();await env.game.actors.documentClass.create({_id:'2222222222222222',name:'Unrelated existing Actor'});
    (env.game.actors as any).overrideId='1111111111111111';
    await expect(importForgeEncounter({...env,prepared,reviewed:true})).rejects.toThrow('冲突');
    expect(env.game.actors.contents?.map(d=>d.id)).toEqual(['2222222222222222']);expect(env.game.macros.contents).toHaveLength(0);
  });
  test('handles cancelled Actor or Macro creation without leaving undefined rollback entries',async()=>{
    for(const kind of ['actors','macros'] as const){const env=runtime(),prepared=await ready();(env.game[kind] as any).cancel=true;
      await expect(importForgeEncounter({...env,prepared,reviewed:true})).rejects.toThrow('取消');
      expect(env.game.actors.contents).toHaveLength(0);expect(env.game.macros.contents).toHaveLength(0);
    }
  });
  test('checks declared coverage and exact actor ownership again before starting a macro',async()=>{
    const env=runtime(),prepared=await prepareForgeEncounter(JSON.stringify(assistedEncounterFixture()));
    const result=await importForgeEncounter({...env,prepared,reviewed:true});
    const dragon:any=env.game.actors.get(result.documents[0]!.id),macro:any=env.game.macros.get(result.documents[2]!.id);
    const carrier=dragon.data.items.find((i:any)=>i.flags?.fvttJsonGenerator?.behaviorMechanics?.some((m:any)=>m.id==='crystalbleed-eclipse-ward'));
    const markers=carrier.flags.fvttJsonGenerator.behaviorMechanics;carrier.flags.fvttJsonGenerator.behaviorMechanics=[];
    await expect(startForgeEncounterMacro(env.game,macro.id)).rejects.toThrow('缺少机制');
    carrier.flags.fvttJsonGenerator.behaviorMechanics=markers;dragon.data.flags['fvtt-json-forge'].encounter.kind='Macro';
    await expect(startForgeEncounterMacro(env.game,macro.id)).rejects.toThrow('替换');
    dragon.data.flags['fvtt-json-forge'].encounter.kind='Actor';macro.data.flags['fvtt-json-forge'].encounter.bindings.dragon=result.documents[1]!.uuid;
    await expect(startForgeEncounterMacro(env.game,macro.id)).rejects.toThrow('绑定');expect(env.executions).toBe(0);
  });
  test('uploads images with verified readback, reuses matching bytes, and rejects existing drift',async()=>{
    const env=runtime(),bytes=readFileSync('tools/forge-encounter/examples/crystalbleed/dragon.png');
    const asset:any={key:'art',fileName:'dragon.png',mime:'image/png',base64:bytes.toString('base64'),sha256:hashEncounterBytes(bytes),targets:[{actorKey:'main',fields:['img']}]};
    const files=new Map<string,Uint8Array>(),dirs=new Set(['']);let uploads=0;
    const saved=globalThis.fetch;
    (globalThis as any).fetch=async(path:string)=>files.has(path)?new Response(files.get(path) as any):new Response('',{status:404});
    const Picker={async browse(_source:string,parent:string){return{dirs:[...dirs].filter(d=>d!==parent&&d.split('/').slice(0,-1).join('/')===parent)};},
      async createDirectory(_source:string,path:string){dirs.add(path);},async upload(_source:string,path:string,file:File){uploads++;files.set(`${path}/${file.name}`,new Uint8Array(await file.arrayBuffer()));}};
    try{
      const port=createEncounterAssetPort({applications:{apps:{FilePicker:{implementation:Picker}}}},env.game);
      const path='fvtt-json-forge/encounters/test/art-dragon.png';
      await port.ensure(asset,path);await port.ensure(asset,path);expect(uploads).toBe(1);
      files.set(path,new Uint8Array([1,2,3]));await expect(port.ensure(asset,path)).rejects.toThrow('拒绝覆盖');expect(uploads).toBe(1);
    }finally{globalThis.fetch=saved;}
  });
  test('rechecks GM authority after asset browsing before any file mutation',async()=>{
    const env=runtime(),bytes=readFileSync('tools/forge-encounter/examples/crystalbleed/dragon.png');
    const asset:any={key:'art',fileName:'dragon.png',mime:'image/png',base64:bytes.toString('base64'),sha256:hashEncounterBytes(bytes),targets:[]};
    let writes=0;const saved=globalThis.fetch;(globalThis as any).fetch=async()=>new Response('',{status:404});
    const Picker={async browse(){env.game.user.isGM=false;return{dirs:[]};},async createDirectory(){writes++;},async upload(){writes++;}};
    try{const port=createEncounterAssetPort({applications:{apps:{FilePicker:{implementation:Picker}}}},env.game);
      await expect(port.ensure(asset,'fvtt-json-forge/encounters/test/art.png')).rejects.toThrow();expect(writes).toBe(0);
    }finally{globalThis.fetch=saved;}
  });
  test('creates both actors plus bound macro, performs no execution, and reuses duplicates',async()=>{
    const env=runtime(),prepared=await ready();
    const result=await importForgeEncounter({...env,prepared,reviewed:true});
    expect(result.documents.map(d=>[d.kind,d.status])).toEqual([['Actor','created'],['Actor','created'],['Macro','created']]);
    expect(env.executions).toBe(0);
    const macro=env.game.macros.get(result.documents[2]!.id)!;
    expect(macro.toObject().command).toContain(`Actor.${result.documents[1]!.id}`);
    expect(listForgeEncounterMacros(env.game)).toHaveLength(1);
    const again=await importForgeEncounter({...env,prepared,reviewed:true});
    expect(again.documents.every(d=>d.status==='existing')).toBe(true);
    await startForgeEncounterMacro(env.game,macro.id);expect(env.executions).toBe(1);
  });
  test('binds the reviewed dragon ID while preserving an unowned Actor with the same name',async()=>{
    const env=runtime(),prepared=await prepareForgeEncounter(JSON.stringify(assistedEncounterFixture()));
    const name=prepared.actors.find(actor=>actor.key==='dragon')!.name;
    const legacy=await env.game.actors.documentClass.create({_id:'2222222222222222',name,type:'npc',flags:{},system:{attributes:{hp:{value:93}}}});
    const before=JSON.stringify(legacy!.toObject());
    const result=await importForgeEncounter({...env,prepared,reviewed:true});
    const dragon=result.documents.find(document=>document.kind==='Actor'&&document.key==='dragon')!;
    const macro=env.game.macros.get(result.documents.find(document=>document.kind==='Macro')!.id)!;
    expect(dragon.id).not.toBe(legacy!.id);
    expect(macro.toObject().flags['fvtt-json-forge'].encounter.bindings.dragon).toBe(dragon.uuid);
    expect(macro.toObject().command).toContain(dragon.uuid);
    expect(macro.toObject().command).not.toContain(legacy!.uuid);
    await startForgeEncounterMacro(env.game,macro.id);
    expect(env.executions).toBe(1);
    expect(JSON.stringify(legacy!.toObject())).toBe(before);
  });
  test('requires GM, exact runtime, current sealed preparation and explicit review',async()=>{
    const env=runtime(),prepared=await ready();
    await expect(importForgeEncounter({...env,prepared,reviewed:false})).rejects.toThrow();
    await expect(importForgeEncounter({...env,prepared:structuredClone(prepared),reviewed:true})).rejects.toThrow();
    env.game.user.isGM=false;await expect(importForgeEncounter({...env,prepared,reviewed:true})).rejects.toThrow();
    env.game.user.isGM=true;env.game.version='12.331';await expect(importForgeEncounter({...env,prepared,reviewed:true})).rejects.toThrow();
    expect(env.game.actors.contents).toHaveLength(0);expect(env.executions).toBe(0);
  });
  test('preflights foreign conflicts without writing or overwriting other documents',async()=>{
    const env=runtime(),prepared=await ready();const id=encounterDocumentId(prepared.bundle.id,'Actor','summon');
    await env.game.actors.documentClass.create({_id:id,name:'Existing unrelated Actor',type:'npc'});
    await expect(importForgeEncounter({...env,prepared,reviewed:true})).rejects.toThrow('冲突');
    expect(env.game.actors.contents).toHaveLength(1);expect(env.game.macros.contents).toHaveLength(0);
  });
  test('cleans up only newly created documents on macro creation failure',async()=>{
    const env=runtime(),prepared=await ready();(env.game.macros as any).fail=true;
    await expect(importForgeEncounter({...env,prepared,reviewed:true})).rejects.toThrow('fixture create failure');
    expect(env.game.actors.contents).toHaveLength(0);expect(env.game.macros.contents).toHaveLength(0);
  });
  test('rejects modified macro code and missing actor bindings before startup',async()=>{
    const env=runtime(),prepared=await ready();const result=await importForgeEncounter({...env,prepared,reviewed:true});
    const macro:any=env.game.macros.get(result.documents[2]!.id);const command=macro.data.command;macro.data.command+='\nthrow Error("tamper")';
    await expect(startForgeEncounterMacro(env.game,macro.id)).rejects.toThrow('改变');expect(env.executions).toBe(0);
    macro.data.command=command;await env.game.actors.get(result.documents[1]!.id)!.delete();
    await expect(startForgeEncounterMacro(env.game,macro.id)).rejects.toThrow('缺失');expect(env.executions).toBe(0);
  });
});
