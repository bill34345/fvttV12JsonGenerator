// Readback only, invoked after the normal client reload; never replays updates.
function verifyServerNextIcons(plan) {
  if(!game.user?.isGM || location.origin!=='http://127.0.0.1:30002' || game.world.id!=='cor-cotn' ||
      game.version!=='14.368' || game.system.version!=='6.0.5')throw Error('ICON_VERIFY_TARGET_MISMATCH');
  if(plan?.revision!==1 || plan.refs?.length!==73)throw Error('FROZEN_ICON_PLAN_REQUIRED');
  const refs=plan.refs.map(r=> {
    const owner=r.actorId?game.actors.get(r.actorId):game.items.get(r.itemId);
    const doc=r.kind==='Actor'||r.kind==='WorldItem'?owner:
      r.kind==='Item'?owner?.items.get(r.itemId):
      r.kind==='ActorEffect'||r.kind==='WorldItemEffect'?owner?.effects.get(r.effectId):
      owner?.items.get(r.itemId)?.effects.get(r.effectId);
    return {kind:r.kind,actorId:r.actorId,itemId:r.itemId,effectId:r.effectId,
      expected:r.newImg,actual:doc?._source.img,matched:doc?.name===r.name && doc?._source.img===r.newImg};
  });
  const actor=game.actors.get('CCQeulSS5VGkOP2y'),effect=actor?.effects.get('yY23mBjn0wsSE16h');
  const dae={version:game.modules.get('dae')?.version,actorId:actor?.id,ac:actor?.system.attributes.ac.value,
    effectId:effect?.id,disabled:effect?.disabled,suppressed:effect?.isSuppressed,
    changes:effect?.system.changes.map(c=>({key:c.key,value:c.value,phase:c.phase,applied:c.applied??null}))};
  return {ok:refs.every(r=>r.matched),refs,dae,actors:[...game.actors.keys()].sort(),items:[...game.items.keys()].sort(),
    worldUpdates:0,paidPackageFunctionalTests:0};
}
