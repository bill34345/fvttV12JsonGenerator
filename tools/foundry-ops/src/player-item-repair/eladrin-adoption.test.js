import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ELADRIN, ELADRIN_APPROVAL, ELADRIN_SEASON_PARAGRAPH, projectEladrinGrantAdoption, addEladrinSeasonClause, eladrinSourceTemplate, projectEladrinFeatureLink } from './eladrin-adoption.mjs';

const species=()=>({_id:ELADRIN.speciesId,name:'雅灵',type:'race',system:{source:{rules:'2014',book:'MPMM'},advancement:{[ELADRIN.advancementId]:{_id:ELADRIN.advancementId,type:'ItemGrant',level:0,configuration:{items:ELADRIN.originalIds.map(id=>({uuid:`Actor.${ELADRIN.actorId}.Item.${id}`,optional:false,sort:0})),optional:false,sorting:'m'},value:{added:Object.fromEntries(ELADRIN.originalIds.map(id=>[id,`Actor.${ELADRIN.actorId}.Item.${id}`]))}}}},flags:{existing:{keep:true}},effects:[]});
const sources=()=>Object.fromEntries(ELADRIN.originalIds.map((id,i)=>[id===ELADRIN.missingId?ELADRIN.tranceId:id,`Item.${String(i+1).padStart(16,'0')}`]));
const trance=()=>({_id:ELADRIN.tranceId,name:'出神 Trance',type:'feat',_stats:{compendiumSource:'Compendium.dnd5e.origins24.Item.phbsptTrance0000'},system:{source:{rules:'2024',license:'CC-BY-4.0'},description:{value:'<p>Existing 2024 text</p>',chat:'preserve'},identifier:'trance',activities:{}},effects:[],flags:{keep:true}});

test('adopts existing Trance while keeping six document IDs, options and other source data',()=>{
 const before=species(), original=structuredClone(before), plan=projectEladrinGrantAdoption(before,sources(),ELADRIN_APPROVAL);
 const expected=structuredClone(before),g=expected.system.advancement[ELADRIN.advancementId];
 g.configuration.items.forEach((r,i)=>r.uuid=plan.destinations[i]);g.value.added=Object.fromEntries(plan.actualIds.map((id,i)=>[id,plan.destinations[i]]));
 assert.deepEqual(plan.candidate,expected);assert.deepEqual(before,original);
 assert.equal(Object.keys(g.value.added).length,7);assert.ok(!g.value.added[ELADRIN.missingId]);assert.ok(g.value.added[ELADRIN.tranceId]);
});
test('refuses unapproved, partial, embedded, duplicate or drifted source/history projections',()=>{
 assert.throws(()=>projectEladrinGrantAdoption(species(),sources(),'old-authorization'));
 const partial=sources();delete partial[ELADRIN.tranceId];assert.throws(()=>projectEladrinGrantAdoption(species(),partial,ELADRIN_APPROVAL));
 const embedded=sources();embedded[ELADRIN.tranceId]='Actor.other.Item.other';assert.throws(()=>projectEladrinGrantAdoption(species(),embedded,ELADRIN_APPROVAL));
 const duplicate=sources();duplicate[ELADRIN.tranceId]=Object.values(duplicate)[0];assert.throws(()=>projectEladrinGrantAdoption(species(),duplicate,ELADRIN_APPROVAL));
 const drift=species();drift.system.advancement[ELADRIN.advancementId].value.added[ELADRIN.missingId]='Item.changed';assert.throws(()=>projectEladrinGrantAdoption(drift,sources(),ELADRIN_APPROVAL));
});
test('the exact 6.0.5 ItemGrant method skips all seven sources instead of duplicating owned features',async()=>{
 const source=readFileSync('F:/FoundryLab/reference-cache/dnd5e/6.0.5/repo/module/documents/advancement/item-grant.mjs','utf8');
 const start=source.indexOf('  async apply('),end=source.indexOf('\n  /* -------------------------------------------- */',start);
 assert.ok(start>=0&&end>start);
 const foundry={utils:{getProperty:(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o)}};
 const Klass=Function('foundry','return class {'+source.slice(start,end)+'}')(foundry);
 const plan=projectEladrinGrantAdoption(species(),sources(),ELADRIN_APPROVAL),grant=plan.candidate.system.advancement[ELADRIN.advancementId];
 const instance=new Klass();instance.value=grant.value;instance.configuration=grant.configuration;
 let created=0,actorUpdates=0;instance.storagePath=()=> 'value.added';instance.createItemData=async()=>{created++;return{_id:String(created),type:'feat'};};
 instance.actor={updateSource:()=>{actorUpdates++;}};instance.updateSource=()=>{};
 assert.deepEqual(await instance.apply(0,{selected:plan.destinations}),{});assert.equal(created,0);assert.equal(actorUpdates,0);
  instance.value=species().system.advancement[ELADRIN.advancementId].value;
  await instance.apply(0,{selected:plan.destinations});assert.equal(created,7);assert.equal(actorUpdates,1);
});
test('appends only the approved season sentence to the current 2024 description',()=>{
 const before=trance(),original=structuredClone(before),plan=addEladrinSeasonClause(before,ELADRIN_APPROVAL),expected=structuredClone(before);
 expected.system.description.value+='\n'+ELADRIN_SEASON_PARAGRAPH;
 assert.deepEqual(plan.candidate,expected);assert.deepEqual(before,original);
 assert.throws(()=>addEladrinSeasonClause(plan.candidate,ELADRIN_APPROVAL));
 const wrong=trance();wrong.system.source.rules='2014';assert.throws(()=>addEladrinSeasonClause(wrong,ELADRIN_APPROVAL));
});

test('the original missing description link resolves to the existing Trance without replacing surrounding source text',()=>{
 const before=species();before.system.description={value:`<p>Original</p>@UUID[Actor.${ELADRIN.actorId}.Item.${ELADRIN.missingId}]{出神}<p>Season table</p>`,chat:'Keep'};
 const original=structuredClone(before),plan=projectEladrinGrantAdoption(before,sources(),ELADRIN_APPROVAL);
 assert.equal(plan.candidate.system.description.value,before.system.description.value.replace(ELADRIN.missingId,ELADRIN.tranceId));
 assert.deepEqual(before,original);assert.equal(plan.candidate.system.description.chat,'Keep');
 before.system.description.value+=' '+before.system.description.value;
 assert.throws(()=>projectEladrinGrantAdoption(before,sources(),ELADRIN_APPROVAL));
});

test('new sources detach grant ownership and actor linkage changes preserve ability mechanics',()=>{
 const original=trance(),to='Item.abcdef0123456789';
 original.flags.dnd5e={sourceId:'Actor.old.Item.old',advancementOrigin:`${ELADRIN.speciesId}.${ELADRIN.advancementId}`};
 const source=eladrinSourceTemplate(original,to,'0123456789abcdef','Gamemaster000001','a'.repeat(64),ELADRIN_APPROVAL);
 assert.deepEqual(source.system,original.system);assert.deepEqual(source.effects,original.effects);
 assert.equal(source.flags.dnd5e.sourceId,undefined);assert.equal(source.flags.dnd5e.advancementOrigin,undefined);
 assert.equal(source.flags.world.nextEladrinSource.originalCompendiumSource,original._stats.compendiumSource);
 const linked=projectEladrinFeatureLink(original,to,ELADRIN_APPROVAL);
 assert.deepEqual(linked.candidate.system,original.system);assert.deepEqual(linked.candidate.effects,original.effects);
 assert.equal(linked.candidate.flags.dnd5e.sourceId,to);
 assert.throws(()=>eladrinSourceTemplate(original,to,'0123456789abcdef','Gamemaster000001','a'.repeat(64),'old'));
 const drift=structuredClone(original);drift.flags.dnd5e.advancementOrigin='other.grant';
 assert.throws(()=>projectEladrinFeatureLink(drift,to,ELADRIN_APPROVAL));
});
