import { expect, test } from 'bun:test';
import { ensureNativeStatusRiders } from '../src/nativeStatusRiders';

test('an immune independent rider may be absent after native/DAE processing without invalidating the primary', async () => {
  for (const value of [['prone'], new Set(['prone'])]) {
    let nativeCalls = 0;
    const events: any[] = [];
    await expect(ensureNativeStatusRiders({
      actor: { uuid: 'Actor.target', system: { traits: { ci: { value } } }, effects: { contents: [] } },
      primary: { active: true, system: { async collectRiders() { nativeCalls++; return []; } } }, status: 'unconscious',
      configurationFor: id => id === 'unconscious' ? { riders: ['prone'] } : { _id: 'canonical-prone' },
      dae: { active: true, version: '14.6.5' }, async modifyBatch() {}, assertLive() {}, record: (type, detail) => events.push({ type, ...detail }),
    })).resolves.toBeUndefined();
    expect(nativeCalls).toBe(0);
    expect(events).toEqual([{ type: 'status-lifecycle-rider-immune', status: 'unconscious', rider: 'prone', actorUuid: 'Actor.target' }]);
  }
});

test('immunity to a different condition cannot hide a missing required independent rider', async () => {
  await expect(ensureNativeStatusRiders({
    actor: { system: { traits: { ci: { value: new Set(['restrained']) } } }, effects: { contents: [] } },
    primary: { active: true, system: { async collectRiders() { return []; } } }, status: 'unconscious',
    configurationFor: id => id === 'unconscious' ? { riders: ['prone'] } : { _id: 'canonical-prone' },
    dae: { active: true, version: '14.6.5' }, async modifyBatch() {}, assertLive() {}, record() {},
  })).rejects.toThrow('未就绪');
});

test('dnd6 rider batches create independent consequences and preserve them after the primary is removed', async () => {
  const effects:any[]=[];
  const batch=[{action:'create',documentName:'ActiveEffect',data:[{_id:'canonical-prone',statuses:['prone']}],keepId:true}];
  const actor={effects,system:{traits:{ci:{value:new Set()}}}};
  await ensureNativeStatusRiders({actor,primary:{active:true,system:{async collectRiders(){return batch;}}},status:'unconscious',
    configurationFor:id=>id==='unconscious'?{riders:['prone']}:{_id:'canonical-prone'},dae:{active:true,version:'14.6.5'},
    async modifyBatch(entries){expect(entries).toBe(batch);effects.push({id:'canonical-prone',statuses:new Set(['prone']),active:true});},assertLive(){},record(){}});
  expect(effects.map(effect=>effect.id)).toEqual(['canonical-prone']);
});

test('only the supported DAE pure automatic projection can become a native independent rider', async () => {
  for(const [version,external,accepted] of [['14.6.5',false,true],['14.6.6',false,true],['14.0.12',false,false],['14.6.5',true,false],['14.6.5','native-origin',false]] as const){
    const source:any={statuses:['prone'],duration:{},changes:[],flags:{dae:{autoCreated:true,specialDuration:[]},...(external?{external:{owned:true}}:{})}};
    if(external==='native-origin'){delete source.flags.external;source.system={origin:{activity:'Actor.foreign.Item.spell.Activity.use'}};}
    const canonical:any={id:'canonical-prone',active:true,statuses:new Set(['prone']),flags:source.flags,toObject:()=>structuredClone(source),
      async update(changes:any){expect(changes).toEqual({'flags.dae.autoCreated':false});this.flags.dae.autoCreated=false;}};
    const call=ensureNativeStatusRiders({actor:{effects:[canonical]},primary:{active:true,system:{async collectRiders(){return [];}}},status:'unconscious',
      configurationFor:id=>id==='unconscious'?{riders:['prone']}:{_id:'canonical-prone'},dae:{active:true,version},async modifyBatch(){},assertLive(){},record(){}});
    if(accepted){await call;expect(canonical.flags.dae.autoCreated).toBe(false);}
    else{await expect(call).rejects.toThrow('未接管');expect(canonical.flags.dae.autoCreated).toBe(true);}
  }
});
