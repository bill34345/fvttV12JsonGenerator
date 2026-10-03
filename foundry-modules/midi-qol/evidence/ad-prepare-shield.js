// Explicit preparation of owned fixture resources and this client's view/target only.
if(location.origin!=='http://127.0.0.1:30002'||game.world.id!=='cor-cotn'||!game.user.isGM)throw new Error('Wrong ServerNext');
const actor=game.actors.get('6G73ekCjdnN2UUZU'),scene=game.scenes.get('RyluHOjH0iBC7xro'),own=game.combats.get('xYa05YifCrc4A3Dh');
if(actor?.name!=='AG-MIDI6L-20260921-Target'||scene?.name!=='AG-MIDI6L-20260921-Scene'||own?.name!=='AG-MIDI6L-20260921-E-Reactions'||scene.active||own.active)throw new Error('Owned fixture/context mismatch');
const shared=()=>({worldTime:game.time.worldTime,activeScene:game.scenes.active?.uuid,activeCombats:game.combats.filter(c=>c.active).map(c=>({uuid:c.uuid,round:c.round,turn:c.turn}))});
const before={shared:shared(),viewedScene:canvas.scene?.uuid,gameCombat:game.combat?.uuid,tracker:ui.combat.viewed?.uuid,targets:[...game.user.targets].map(t=>t.document.uuid),hp:actor.system.attributes.hp.value,acOverride:actor.system.attributes.ac.override,acValue:actor.system.attributes.ac.value,acBonus:actor.system.attributes.ac.bonus,slot1:actor.system.spells.spell1.value,ownRound:own.round,ownTurn:own.turn,effects:actor.effects.map(e=>({uuid:e.uuid,active:e.active,source:e.toObject()}))};
if(actor.effects.some(e=>e.name==='Imperceptible Barrier'&&e.active))throw new Error('An active Shield already exists; do not start another cast');
await scene.view();
if(canvas.scene!==scene||!canvas.ready||scene.active||own.active||JSON.stringify(shared())!==JSON.stringify(before.shared))throw new Error('Context changed while preparing owned Scene');
const token=scene.tokens.get('UOJVkOn5ulEhnMdw');
if(token?.actor!==actor||!token.object)throw new Error('Owned token is not linked to Target');
await token.object.setTarget(true,{releaseOthers:true});
if(actor.system.spells.spell1.value<1){
 if(actor.system.spells.spell1.max<1)throw new Error('Owned Target lacks a level-1 slot');
 await actor.update({'system.spells.spell1.value':1});
}
// A fixed AC override bypasses all bonuses in dnd5e 6; clear only this owned fixture's override for the semantic check.
if(Number.isFinite(actor.system.attributes.ac.override))await actor.update({'system.attributes.ac.override':null});
await ui.combat.render({force:true,combat:own});
const report={case:'AD owned Shield preparation',at:new Date().toISOString(),before,after:{shared:shared(),viewedScene:canvas.scene?.uuid,gameCombat:game.combat?.uuid,tracker:ui.combat.viewed?.uuid,targets:[...game.user.targets].map(t=>t.document.uuid),slot1:actor.system.spells.spell1.value,acOverride:actor.system.attributes.ac.override,acValue:actor.system.attributes.ac.value,acBonus:actor.system.attributes.ac.bonus,ownRound:own.round,ownTurn:own.turn,targetInCombat:actor.inCombat},preparationOnly:true};
report.sharedUnchanged=JSON.stringify(before.shared)===JSON.stringify(report.after.shared);
report.contextReady=game.combat===own&&ui.combat.viewed===own&&actor.inCombat&&!own.active&&!scene.active&&!Number.isFinite(actor.system.attributes.ac.override);
const saved=await ChatMessage.create({content:'<pre>Publishing AD preparation...</pre>',whisper:[game.user.id]});report.messageUuid=saved.uuid;
await saved.update({content:`<pre>${JSON.stringify(report,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</pre>`});
ui.notifications.info(`AD preparation saved: ${saved.uuid}`);
if(!report.sharedUnchanged||!report.contextReady)throw new Error('Owned preparation gate failed; do not cast');