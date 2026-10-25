import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { projectClasspack606LoadManifest } from './load-compatibility';
import { composeClasspackRuntime } from './compose-runtime';
function manifest() {
  return { id:'dnd5e_classpack',version:'4.3.4-next.1',compatibility:{minimum:'14.368',verified:'14.368',maximum:'14.368'},
    esmodules:['scripts/next-migration.mjs'],packs:Array.from({length:21},(_,i)=>({name:'pack'+i,path:'packs/pack'+i})),
    relationships:{systems:[{id:'dnd5e',compatibility:{minimum:'6.0.5',verified:'6.0.5',maximum:'6.0.5'}}],recommends:[{id:'dae'}]},
    flags:{classpackNext:{upstreamVersion:'4.3.4',upstreamArchiveSha256:'8dceac980d5521c3119141ee166589a0f5ab78c13d9987f61c33f96c72fe22c1',target:{core:'14.368',dnd5e:'6.0.5'},migration:'explicit-runtime-api',migrationRevision:4,sourceProjectionRevision:7,runtimeSha256:'unchanged',sourceBaselineSha256:'unchanged'}} };
}
test('606 load metadata changes only maximum, retaining migration identity and all pack data', () => {
  const source=manifest(),before=structuredClone(source),result=projectClasspack606LoadManifest(source);
  expect(source).toEqual(before);expect(result.relationships.systems[0].compatibility.maximum).toBe('6.0.6');
  result.relationships.systems[0].compatibility.maximum='6.0.5';expect(result).toEqual(before);
});
test('load projection refuses foreign, future, duplicate and crossed migration identities', () => {
  const changes=[(m:any)=>m.id='foreign',(m:any)=>m.compatibility.maximum='14.369',(m:any)=>m.flags.classpackNext.target.dnd5e='6.0.6',
    (m:any)=>m.flags.classpackNext.sourceProjectionRevision=8,(m:any)=>m.relationships.systems[0].compatibility.maximum='6.0.6',
    (m:any)=>m.relationships.systems.push(structuredClone(m.relationships.systems[0]))];
  for(const change of changes){const m=manifest();change(m);expect(()=>projectClasspack606LoadManifest(m)).toThrow();}
});
test('actual composed runtime exposes API without migration and rejects 606 migration entrypoints before data access', async () => {
  const callbacks=new Map<string,Function[]>(),accesses:string[]=[];
  const module:Record<string,any>={};
  const game={version:'14.368',system:{id:'dnd5e',version:'6.0.6'},modules:new Map([['dnd5e_classpack',module]]),
    get packs(){accesses.push('packs');throw Error('No pack access permitted');},
    settings:{register(){},get(){accesses.push('get');throw Error('No setting access permitted');},set(){accesses.push('set');throw Error('No setting mutation permitted');}}};
  const Hooks={on(){return 1;},once(name:string,fn:Function){callbacks.set(name,[...(callbacks.get(name)??[]),fn]);}};
  const context=vm.createContext({game,Hooks,console:{info(){}}});
  vm.runInContext(composeClasspackRuntime(import.meta.dir),context);
  for(const fn of callbacks.get('init')??[])fn();for(const fn of callbacks.get('ready')??[])fn();
  expect(typeof module.api.inventory).toBe('function');expect(accesses).toEqual([]);
  for(const name of ['preflight','migrate','confirmRecovery'])await expect(module.api[name]()).rejects.toThrow('requires dnd5e 6.0.5');
  expect(accesses).toEqual([]);
  expect(readFileSync(import.meta.dir+'/next-migration.mjs','utf8')).toContain('const EXPECTED_DND5E_VERSION = "6.0.5"');
});
