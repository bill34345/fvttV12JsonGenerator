import {expect} from 'bun:test';

interface ApprovedConditionEffect {
  id:string;
  status:string;
  sourceText:string;
  condition:string;
  staged?:true;
}

// Frozen mechanics omit IDs and flags, so verify the real templates and every
// Activity reference before removing only the approved increment for comparison.
export function expectSourceConditionEffects(item:any,operationId:string,effects:ApprovedConditionEffect[],links:Record<string,Array<{_id:string;onSave?:false}>>):void{
  expect(item.effects.map((effect:any)=>effect._id)).toEqual(effects.map(effect=>effect.id));
  for(const approved of effects){
    const effect=item.effects.find((entry:any)=>entry._id===approved.id);
    expect(effect).toMatchObject({statuses:[approved.status],changes:[],disabled:false,transfer:false});
    expect(effect.flags.fvttJsonGenerator).toEqual({sourceDerivedEmbeddedEffect:true,sourceDuration:null,sourceOperationId:operationId,
      conditionLifecycle:{statuses:[approved.status],condition:approved.condition,...(approved.staged?{staged:true}:{}),version:1,mode:'gm',sourceText:approved.sourceText}});
    expect(effect.description).toContain(approved.sourceText);
    expect(effect.description).toContain(approved.condition);
  }
  for(const [id,activity] of Object.entries<any>(item.system.activities)){
    expect(activity._id).toBe(id);
    expect(activity.effects??[]).toEqual(links[id]??[]);
    if(links[id]){
      const flags=activity.flags.fvttJsonGenerator;
      expect(flags.sourceOperation?.id??flags.sourceConditionStage?.sourceOperationId).toBe(operationId);
    }
  }
  for(const id of Object.keys(links))expect(item.system.activities[id]).toBeDefined();
}

export function withoutApprovedConditionEffects(actor:any,approved:Array<{item:string;ids:string[]}>):any{
  const historical=structuredClone(actor);
  for(const {item:name,ids} of approved){
    const item=historical.items.find((entry:any)=>entry.name===name);
    item.effects=item.effects.filter((effect:any)=>!ids.includes(effect._id));
    for(const activity of Object.values<any>(item.system.activities))if(activity.effects)activity.effects=activity.effects.filter((effect:any)=>!ids.includes(effect._id));
  }
  return historical;
}

export function expectFrozenSourceDescriptions(actor:any,ir:any,names:Record<string,string>={}):void{
  const text=(value:string)=>value.replace(/<[^>]*>/gu,' ').replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&quot;/gu,'"').replace(/&#39;/gu,"'").replace(/&amp;/gu,'&').replace(/\s+/gu,' ').trim();
  for(const category of ['traits','actions','bonusActions','reactions','legendaryActions'])for(const feature of ir.creature[category]??[]){
    const item=actor.items.find((entry:any)=>entry.name===(names[feature.name]??feature.name));
    expect(item).toBeDefined();
    expect(text(item.system.description.value)).toContain(text(feature.description));
  }
}
