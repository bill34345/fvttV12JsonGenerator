// Native Script Macro for the user's explicitly authorized fixture cleanup.
// Run after final evidence/config restoration. No database or service operations.
if(location.origin!=='http://127.0.0.1:30002'||game.world.id!=='cor-cotn'||!game.user.isGM)throw new Error('Wrong target');
const actors=[
  ['waaKKOrQv76aNNG3','AG-MIDI6L-20260921-Attacker'],
  ['UFma7YaMRS6e20JT','AG-MIDI6L-20260921-Caster'],
  ['6G73ekCjdnN2UUZU','AG-MIDI6L-20260921-Target'],
  ['vJb8pcWFJJh6vQj7','AG-MIDI6L-20260921-SummonProfile'],
  ['t7W3isT6GdOFeeyd','AG-MIDI6L-20260921-SummonProfile Familiar']
];
const actorIds=new Set(actors.map(([id])=>id));
const sceneId='RyluHOjH0iBC7xro', combatId='xYa05YifCrc4A3Dh';
const macroSpecs=[['8e4OhzBcxoQ6eaQy','AG-L6-RUNTIME-FINGERPRINT-20260921'],
  ['GcNaY7ZO5aaqZo4n','AG-MIDI6P-E2E-HELPER-20260921']];
const checks=[...actors.map(([id,name])=>[game.actors,id,name]),
  [game.scenes,sceneId,'AG-MIDI6L-20260921-Scene'],
  [game.combats,combatId,'AG-MIDI6L-20260921-E-Reactions'],
  ...macroSpecs.map(([id,name])=>[game.macros,id,name])];
for(const [collection,id,name]of checks){const d=collection.get(id);if(d&&d.name!==name)throw new Error(`Identity mismatch: ${id}`);}
if(game.scenes.get(sceneId)?.active||canvas.scene?.id===sceneId||game.combats.get(combatId)?.active||game.combat?.id===combatId){
  throw new Error('Restore client view to shared scene/tracker first; owned scene/combat must be inactive');
}
for(const scene of game.scenes)for(const token of scene.tokens){
  if(scene.id!==sceneId&&actorIds.has(token.actorId))throw new Error(`Fixture actor referenced in other scene: ${token.uuid}`);
  if(scene.id===sceneId&&!actorIds.has(token.actorId))throw new Error(`Unknown actor token in fixture scene: ${token.uuid}`);
}
const ownedTokenIds=new Set(game.scenes.get(sceneId)?.tokens.map(t=>t.id)??[]);
const ownedCombatantIds=new Set(['lGBbGINHtHX0mOL9','eXfNEFdoaBWDRJZu']);
for(const combat of game.combats){
  if(combat.id!==combatId&&(combat.scene?.id===sceneId||combat.sceneId===sceneId)){
    throw new Error(`Fixture scene referenced in another combat: ${combat.uuid}`);
  }
  for(const combatant of combat.combatants){
    if(combat.id===combatId){
      if(!ownedCombatantIds.has(combatant.id)||!actorIds.has(combatant.actorId))throw new Error(`Unknown combatant in fixture combat: ${combatant.uuid}`);
    }else if(actorIds.has(combatant.actorId)||ownedTokenIds.has(combatant.tokenId)
      ||combatant.sceneId===sceneId||combatant.token?.parent?.id===sceneId){
      throw new Error(`Fixture document referenced in another combat: ${combatant.uuid}`);
    }
  }
}
const snapshot=()=>({worldTime:game.time.worldTime,activeScene:game.scenes.active?.id,
  viewedScene:canvas.scene?.id,viewedCombat:ui.combat.viewed?.id,
  activeCombats:game.combats.filter(c=>c.active).map(c=>({id:c.id,round:c.round,turn:c.turn}))});
const before=snapshot(),preserve=new Set(game.messages.map(m=>m.id));
const removed=[],alreadyAbsent=[];
// Delete own combat before scene/actors, with the client viewing the shared combat.
const ordered=[[game.combats,combatId],[game.scenes,sceneId],...actors.map(([id])=>[game.actors,id]),
  ...macroSpecs.map(([id])=>[game.macros,id])];
for(const [collection,id]of ordered){
  const doc=collection.get(id);
  if(!doc){alreadyAbsent.push(id);continue;}
  const uuid=doc.uuid;
  await doc.delete();
  if(collection.has(id))throw new Error(`Deletion not confirmed: ${uuid}`);
  removed.push(uuid);
  if(JSON.stringify(before)!==JSON.stringify(snapshot()))throw new Error('Shared state changed; stop and report, do not roll back others');
}
const report={case:'R Z03 authorized owned-fixture cleanup',at:new Date().toISOString(),removed,alreadyAbsent,
  remaining:checks.filter(([collection,id])=>collection.has(id)).map(([,id])=>id),
  messagesMissing:[...preserve].filter(id=>!game.messages.has(id)),before,after:snapshot()};
const safe=JSON.stringify(report,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await ChatMessage.create({content:`<pre>${safe}</pre>`});
