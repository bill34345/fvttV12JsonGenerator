// One native UI Apply followed by the native owned-combat expiry lifecycle.
// No Midi manual-apply button, direct effect mutation, registry writes, or clock advancement.
if(location.origin!=='http://127.0.0.1:30002'||game.world.id!=='cor-cotn'||!game.user.isGM)throw new Error('Wrong ServerNext');
const own=game.combats.get('xYa05YifCrc4A3Dh');
const actor=game.actors.get('6G73ekCjdnN2UUZU');
if(!own||own.active||own.name!=='AG-MIDI6L-20260921-E-Reactions'||actor?.name!=='AG-MIDI6L-20260921-Target')throw new Error('Owned fixture mismatch');
const supplied=await foundry.applications.api.DialogV2.prompt({window:{title:'AD: single native Shield Apply'},content:'<label>New Shield ChatMessage UUID <input name="messageUuid" type="text" required placeholder="ChatMessage.…"></label>',ok:{label:'Verify and apply once',callback:(_event,button)=>button.form.elements.messageUuid.value.trim()}});
if(!/^ChatMessage\.[A-Za-z0-9]{16}$/.test(supplied??''))throw new Error('Enter the exact newly cast Shield message UUID');
const message=game.messages.get(supplied.split('.')[1]);
const activity=message?.getAssociatedActivity({scaled:true});
if(activity?.item?.actor?.id!==actor.id||activity.item.id!=='tX2Mk5tbcWupZhmH')throw new Error('Message is not the owned Shield activity');
if(!Number.isFinite(message._stats?.createdTime)||message._stats.createdTime<Date.parse('2026-09-22T03:44:03.842Z'))throw new Error('Use a new Shield cast created after this diagnostic was prepared');
if(canvas.scene?.id!=='RyluHOjH0iBC7xro'||!canvas.ready)throw new Error('First finish viewing owned Scene');
const shared=()=>({worldTime:game.time.worldTime,activeScene:game.scenes.active?.uuid,activeCombats:game.combats.filter(c=>c.active).map(c=>({uuid:c.uuid,round:c.round,turn:c.turn}))});
const snap=()=>({at:new Date().toISOString(),gameCombat:game.combat?.uuid,tracker:ui.combat.viewed?.uuid,trackerRendered:ui.combat.rendered,own:{uuid:own.uuid,active:own.active,round:own.round,turn:own.turn},hp:actor.system.attributes.hp.value,acValue:actor.system.attributes.ac.value,acOverride:actor.system.attributes.ac.override,acBonus:actor.system.attributes.ac.bonus,effects:actor.effects.filter(e=>e.name==='Imperceptible Barrier').map(e=>({uuid:e.uuid,active:e.active,trackable:e.isExpiryTrackable,registered:ActiveEffect.registry.has(e),source:e.toObject(),startCombatUuid:e.start?.combat?.uuid,sourceActor:e.getSourceActor()?.uuid}))});
const report={case:'AD single native Shield Apply and natural expiry',at:new Date().toISOString(),castMessageUuid:message.uuid,sharedBefore:shared(),initial:snap(),events:[],nativeApplyClicks:0};
const ensureOwnedContext=()=>{
 if(game.actors.get(actor.id)!==actor||actor.name!=='AG-MIDI6L-20260921-Target'||game.combats.get(own.id)!==own||own.active||own.name!=='AG-MIDI6L-20260921-E-Reactions')throw new Error('Owned fixture changed while waiting');
 if(canvas.scene?.id!=='RyluHOjH0iBC7xro'||!canvas.ready||game.combat!==own||ui.combat.viewed!==own||!actor.inCombat)throw new Error('Owned combat/view context changed while waiting');
 if(JSON.stringify(shared())!==JSON.stringify(report.sharedBefore))throw new Error('Shared state changed; stop without advancing or reverting others');
};
const registrations=[];let expiryTimer;
const watch=(name,fn)=>registrations.push([name,Hooks.on(name,fn)]);
const capture=(name,e,changes)=>{if(e.parent?.id===actor.id&&e.name==='Imperceptible Barrier')report.events.push({name,at:new Date().toISOString(),uuid:e.uuid,changes:changes?foundry.utils.deepClone(changes):null,source:e.toObject(),gameCombat:game.combat?.uuid});};
try {
 if(report.initial.effects.some(e=>e.active))throw new Error('An active Shield already exists; do not apply again');
 ui.sidebar.changeTab('chat','primary');
 const card=ui.chat.element.querySelector(`[data-message-id="${message.id}"]`);
 const tray=card?.querySelector('effect-application');
 if(!tray||tray.chatMessage?.id!==message.id)throw new Error('The exact native Shield tray is not rendered; do not use midiApplyEffects');
 tray.open=true;
 card.scrollIntoView({block:'center'});
 const profileDeadline=Date.now()+3000;
 while(!tray.effects.some(e=>e.id==='Bv3EoHGfYCprLdG1')&&Date.now()<profileDeadline)await new Promise(resolve=>setTimeout(resolve,50));
 const profile=tray.effects.find(e=>e.id==='Bv3EoHGfYCprLdG1');
 if(!profile)throw new Error('Expected Shield profile not in native tray');
 const select=tray.effectsList.querySelector(`[data-uuid="${profile.uuid}"] button`);
 if(!select||select.disabled)throw new Error('Native effect selection button unavailable');
 select.click(); // Native non-shift selection clears other checked effects.
 const chosen=tray.effects.filter(e=>tray.effectChecked(e.uuid));
 if(chosen.length!==1||chosen[0].uuid!==profile.uuid)throw new Error('Select exactly the Shield effect');
 const readTargets=()=>Array.from(tray.targetList?.targets??card.querySelector('recorded-targets')?.targets??[]);
 const targetDeadline=Date.now()+3000;
 let targets=readTargets();
 while(!targets.length&&Date.now()<targetDeadline){await new Promise(resolve=>setTimeout(resolve,50));targets=readTargets();}
 const permitted=new Set([actor.uuid,'Scene.RyluHOjH0iBC7xro.Token.UOJVkOn5ulEhnMdw']);
 if(targets.length!==1||!permitted.has(targets[0]))throw new Error(`Select only the owned Target through the native tray controls. Actual targets: ${JSON.stringify(targets)}`);
 const apply=tray.querySelector('button[data-action="apply"]');
 if(!apply||apply.disabled||apply.closest('effect-application')!==tray)throw new Error('Unique native Apply button unavailable');
 // Do this last, after all scene navigation and UI preparation.
 await ui.combat.render({force:true,combat:own});
 if(game.combat!==own||ui.combat.viewed!==own||!actor.inCombat)throw new Error('Native Apply combat context is not the owned encounter');
 ensureOwnedContext();
 const resolvedTarget=fromUuidSync(targets[0],{strict:false});
 if((resolvedTarget?.documentName==='Token'?resolvedTarget.actor:resolvedTarget)!==actor)throw new Error('Selected target no longer resolves to the owned Actor');
 report.beforeApply=snap();
 report.nativeSelection={profile:profile.uuid,targets,tag:tray.tagName,action:apply.dataset.action};
 watch('createActiveEffect',(e)=>capture('createActiveEffect',e));
 watch('updateActiveEffect',(e,c)=>capture('updateActiveEffect',e,c));
 watch('deleteActiveEffect',(e)=>capture('deleteActiveEffect',e));
 ensureOwnedContext();
 report.nativeApplyClicks++;
 apply.click(); // Exactly the normal native UI handler, never midiApplyEffects.
 const deadline=Date.now()+5000;
 while(Date.now()<deadline){
   const active=actor.effects.filter(e=>e.name==='Imperceptible Barrier'&&e.active);
   if(active.length>1||active.length===1&&ActiveEffect.registry.has(active[0]))break;
   await new Promise(resolve=>setTimeout(resolve,50));
 }
 report.afterApply=snap();
 const active=actor.effects.filter(e=>e.name==='Imperceptible Barrier'&&e.active);
 if(active.length!==1)throw new Error(`Single native Apply produced ${active.length} active Shields`);
 const effect=active[0];
 if(effect.start?.combat!==own||!effect.isExpiryTrackable||!ActiveEffect.registry.has(effect))throw new Error('Created Shield is not tracked in the owned combat');
 if(!game.user.isActiveGM||!game.users.activeGM?.isSelf)throw new Error('Native expiry requires active GM');
 const combatant=own.getCombatantsByActor(actor)[0];
 const turn=own.turns.indexOf(combatant);
 if(turn<0)throw new Error('Owned Target combatant missing');
 report.effectUuid=effect.uuid;
 report.expectedExpiryPredicate=effect.isExpiryEvent('turnStart',{combat:own,round:own.round+1,turn});
 let finish;
 const completed=new Promise(resolve=>{finish=resolve;});
 watch('combatTurnChange',(c,previous,current)=>{if(c.id===own.id){report.events.push({name:'combatTurnChange',at:new Date().toISOString(),previous,current});finish(true);}});
 ensureOwnedContext();
 await own.update({round:own.round+1,turn},{worldTime:{delta:0}});
 report.turnLifecycleCompleted=await Promise.race([completed,new Promise(resolve=>{expiryTimer=setTimeout(()=>resolve(false),10000);})]);
 report.afterExpiry=snap();
 const finalEffect=actor.effects.get(effect.id);
 report.observedExpiry={stillPresent:!!finalEffect,active:finalEffect?.active??false,expired:finalEffect?.duration.expired??null,registered:finalEffect?ActiveEffect.registry.has(finalEffect):false,acValue:actor.system.attributes.ac.value,acOverride:actor.system.attributes.ac.override,acBonus:actor.system.attributes.ac.bonus};
} catch(error){report.operationError=String(error?.stack??error);}
finally {clearTimeout(expiryTimer);for(const [name,id]of registrations)Hooks.off(name,id);}
report.final=snap();report.sharedAfter=shared();report.sharedUnchanged=JSON.stringify(report.sharedBefore)===JSON.stringify(report.sharedAfter);
const saved=await ChatMessage.create({content:'<pre>Publishing AD native lifecycle evidence...</pre>',whisper:[game.user.id]});
report.messageUuid=saved.uuid;
const encoded=JSON.stringify(report,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await saved.update({content:`<pre>${encoded}</pre>`});
ui.notifications.info(`AD evidence saved: ${saved.uuid}`);