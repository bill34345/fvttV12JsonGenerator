// Native Script Macro; run AFTER q-combat-view-preflight.js. Observes real
// eligibility and events, then advances only the already-owned inactive Combat.
if (location.origin !== 'http://127.0.0.1:30002' || game.world.id !== 'cor-cotn' || !game.user.isGM) throw new Error('Wrong target');
const own = game.combats.get('xYa05YifCrc4A3Dh');
const target = game.actors.get('6G73ekCjdnN2UUZU');
const activeShields = target?.effects.filter(e=>e.name==='Imperceptible Barrier' && e.active) ?? [];
if (activeShields.length !== 1) throw new Error('First normally cast/apply one fresh Shield in the owned combat; the old expired effect cannot test a transition');
const effect = activeShields[0];
if (!own || own.active || game.combat !== own || target?.name !== 'AG-MIDI6L-20260921-Target'
    || effect?.name !== 'Imperceptible Barrier') throw new Error('Owned fixture/context mismatch');
const state = () => ({worldTime: game.time.worldTime, activeScene:game.scenes.active?.id,
  combats:game.combats.filter(c=>c.active).map(c=>({id:c.id,round:c.round,turn:c.turn}))});
const sharedBefore = state();
const report = {case:'AB C06 registry and active-GM diagnostic',at:new Date().toISOString(),
  user:{id:game.user.id,isActiveGM:game.user.isActiveGM,activeGMId:game.users.activeGM?.id,
    activeGMIsSelf:game.users.activeGM?.isSelf},
  expiryAction:CONFIG.ActiveEffect.expiryAction,registryInitialized:ActiveEffect.registry.initialized,
  sharedBefore,events:[]};
const read = () => {
  const e=target.effects.get(effect.id);
  return {effect:e?.toObject()??null,active:e?.active,trackable:e?.isExpiryTrackable,
    registered:e?ActiveEffect.registry.has(e):false,remaining:e?String(e.duration.remaining):null,
    startCombatUuid:e?.start.combat?.uuid,startCombatMatches:e?.start.combat===own,
    sourceActor:e?.getSourceActor()?.uuid,acBonus:target.system.attributes.ac.bonus};
};
report.before=read();
const combatant=own.getCombatantsByActor(target)[0];
const turn=own.turns.indexOf(combatant);
if (turn<0) throw new Error('Target combatant missing');
report.expectedExpiryPredicate=effect.isExpiryEvent('turnStart',{combat:own,round:own.round+1,turn});
const writeReport=async()=>{
const saved = await ChatMessage.create({content:'<pre>Publishing AB evidence...</pre>',whisper:[game.user.id]});
report.messageUuid=saved.uuid;
const encoded=JSON.stringify(report,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await saved.update({content:`<pre>${encoded}</pre>`});
ui.notifications.info(`AB evidence saved: ${saved.uuid}`);
};
// Do not fake primary-GM status, register effects manually, or invoke expiry refresh.
if (!game.user.isActiveGM || !game.users.activeGM?.isSelf || !effect.isExpiryTrackable || !ActiveEffect.registry.has(effect)) {
  report.skipped='Required native GM/registry gate is not satisfied; capture before selecting a repair';
  await writeReport();
} else {
  let done, timer;
  const completion=new Promise(resolve=>{done=resolve;});
  const registrations=[];
  const watch=(name,fn)=>registrations.push([name,Hooks.on(name,fn)]);
  watch('combatTurnChange',(combat,previous,current)=>{
    if(combat.id!==own.id)return;
    report.events.push({name:'combatTurnChange',previous,current,at:new Date().toISOString()});
    done(true);
  });
  watch('updateActiveEffect',(e,changes)=>{if(e.id===effect.id&&e.parent?.id===target.id)report.events.push({name:'updateActiveEffect',changes});});
  watch('deleteActiveEffect',e=>{if(e.id===effect.id&&e.parent?.id===target.id)report.events.push({name:'deleteActiveEffect',uuid:e.uuid});});
  const onRejection=e=>report.events.push({name:'unhandledrejection',message:String(e.reason?.message??e.reason)});
  window.addEventListener('unhandledrejection',onRejection);
  try {
    await own.update({round:own.round+1,turn},{worldTime:{delta:0}});
    report.turnLifecycleCompleted=await Promise.race([completion,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),10000);})]);
    report.after=read();
    report.sharedAfter=state();
    report.sharedUnchanged=JSON.stringify(sharedBefore)===JSON.stringify(report.sharedAfter);
  } catch(error) {report.error=String(error?.stack??error);}
  finally {
    clearTimeout(timer);
    for(const [name,id] of registrations)Hooks.off(name,id);
    window.removeEventListener('unhandledrejection',onRejection);
  }
  await writeReport();
}
