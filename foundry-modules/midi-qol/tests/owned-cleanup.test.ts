import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const code=readFileSync(resolve(import.meta.dir,'../evidence/r-owned-fixture-cleanup.js'),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('location','game','canvas','ui','ChatMessage',code);
class Collection extends Map<string,any> {
  override [Symbol.iterator](): MapIterator<any> {return this.values();}
  filter(fn:(d:any)=>boolean){return [...this.values()].filter(fn);}
  map(fn:(d:any)=>any){return [...this.values()].map(fn);}
  get active(){return this.filter(d=>d.active)[0];}
}
function fixture(){
  const removed:string[]=[], reports:any[]=[];
  const game:any={world:{id:'cor-cotn'},user:{isGM:true},time:{worldTime:100},
    actors:new Collection(),scenes:new Collection(),combats:new Collection(),macros:new Collection(),messages:new Collection()};
  const add=(collection:Collection,type:string,id:string,name:string,extra:any={})=>{
    const doc:any={id,name,uuid:`${type}.${id}`,...extra,delete:async()=>{removed.push(doc.uuid);collection.delete(id);}};
    collection.set(id,doc);return doc;
  };
  for(const [id,suffix] of [['waaKKOrQv76aNNG3','Attacker'],['UFma7YaMRS6e20JT','Caster'],
    ['6G73ekCjdnN2UUZU','Target'],['vJb8pcWFJJh6vQj7','SummonProfile'],['t7W3isT6GdOFeeyd','SummonProfile Familiar']]){
    add(game.actors,'Actor',id!,`AG-MIDI6L-20260921-${suffix}`);
  }
  add(game.actors,'Actor','foreign','Unrelated actor');
  const scene=add(game.scenes,'Scene','RyluHOjH0iBC7xro','AG-MIDI6L-20260921-Scene',{active:false,tokens:new Collection()});
  const shared=add(game.scenes,'Scene','shared','Shared',{active:true,tokens:new Collection()});
  const combat=add(game.combats,'Combat','xYa05YifCrc4A3Dh','AG-MIDI6L-20260921-E-Reactions',{active:false,combatants:new Collection()});
  const sharedCombat=add(game.combats,'Combat','sharedCombat','Shared combat',{active:true,round:11,turn:5,combatants:new Collection()});
  game.combat=sharedCombat;
  add(game.macros,'Macro','8e4OhzBcxoQ6eaQy','AG-L6-RUNTIME-FINGERPRINT-20260921');
  add(game.macros,'Macro','GcNaY7ZO5aaqZo4n','AG-MIDI6P-E2E-HELPER-20260921');
  game.messages.set('evidence',{id:'evidence'});
  const execute=()=>run({origin:'http://127.0.0.1:30002'},game,{scene:shared},{combat:{viewed:sharedCombat}},
    {create:async(data:any)=>{reports.push(data);}});
  return {game,scene,shared,combat,sharedCombat,removed,reports,execute};
}
test('actual cleanup script deletes only its exact nine owned roots and preserves unrelated documents/messages',async()=>{
  const f=fixture();await f.execute();
  expect(f.removed).toHaveLength(9);
  expect(f.removed[0]).toBe('Combat.xYa05YifCrc4A3Dh');
  expect(f.removed[1]).toBe('Scene.RyluHOjH0iBC7xro');
  expect(f.removed.at(-1)).toBe('Macro.GcNaY7ZO5aaqZo4n');
  expect(f.game.actors.has('foreign')).toBe(true);
  expect(f.game.scenes.has('shared')).toBe(true);
  expect(f.game.combats.has('sharedCombat')).toBe(true);
  expect(f.game.messages.has('evidence')).toBe(true);
  expect(f.reports).toHaveLength(1);
});
test('wrong name, shared actor references, unknown token and active fixture all reject before any deletion',async()=>{
  const mutations=[
    (f:ReturnType<typeof fixture>)=>{f.game.actors.get('6G73ekCjdnN2UUZU').name='Unrelated';},
    (f:ReturnType<typeof fixture>)=>{f.shared.tokens.set('foreignToken',{actorId:'6G73ekCjdnN2UUZU',uuid:'Scene.shared.Token.foreignToken'});},
    (f:ReturnType<typeof fixture>)=>{f.scene.tokens.set('foreignActor',{actorId:'foreign',uuid:'Scene.fixture.Token.foreignActor'});},
    (f:ReturnType<typeof fixture>)=>{f.sharedCombat.combatants.set('foreignRef',{actorId:'6G73ekCjdnN2UUZU',uuid:'Combat.shared.Combatant.foreignRef'});},
    (f:ReturnType<typeof fixture>)=>{f.sharedCombat.scene=f.scene;},
    (f:ReturnType<typeof fixture>)=>{f.scene.tokens.set('owned',{id:'owned',actorId:'6G73ekCjdnN2UUZU'});f.sharedCombat.combatants.set('foreignRef',{tokenId:'owned',uuid:'Combat.shared.Combatant.foreignRef'});},
    (f:ReturnType<typeof fixture>)=>{f.combat.combatants.set('unknown',{id:'unknown',actorId:'foreign',uuid:'Combat.fixture.Combatant.unknown'});},
    (f:ReturnType<typeof fixture>)=>{f.combat.active=true;},
  ];
  for(const mutate of mutations){const f=fixture();mutate(f);await expect(f.execute()).rejects.toThrow();expect(f.removed).toEqual([]);}
});
test('native delete failure stops before later roots; retry tolerates already absent own documents',async()=>{
  const f=fixture();f.scene.delete=async()=>{throw new Error('Native operation rejected');};
  await expect(f.execute()).rejects.toThrow('Native operation rejected');
  expect(f.removed).toEqual(['Combat.xYa05YifCrc4A3Dh']);
  expect(f.game.actors.size).toBe(6);
  const retry=fixture();retry.game.combats.delete('xYa05YifCrc4A3Dh');await retry.execute();
  expect(retry.removed).toHaveLength(8);
});
