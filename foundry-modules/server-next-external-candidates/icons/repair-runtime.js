// Invoke through an owned normal Foundry Macro with its frozen private plan.
async function repairServerNextIcons(plan) {
  if (!game.user?.isGM || location.origin !== 'http://127.0.0.1:30002' ||
      game.world.id !== 'cor-cotn' || game.version !== '14.368' || game.system.version !== '6.0.5') {
    throw Error('ICON_REPAIR_TARGET_MISMATCH');
  }
  if (plan?.revision !== 1 || plan.refs?.length !== 73) throw Error('FROZEN_ICON_PLAN_REQUIRED');
  const resolve = r => {
    if (r.actorId === 'LN5PLqTTdx0l7o7w') throw Error('PROTECTED_ACTOR');
    const owner = r.actorId ? game.actors.get(r.actorId) : game.items.get(r.itemId);
    if (!owner) throw Error('ICON_OWNER_MISSING');
    let doc;
    if (r.kind === 'Actor' || r.kind === 'WorldItem') doc = owner;
    else if (r.kind === 'Item') doc = owner.items.get(r.itemId);
    else if (r.kind === 'ActorEffect' || r.kind === 'WorldItemEffect') doc = owner.effects.get(r.effectId);
    else if (r.kind === 'ItemEffect') doc = owner.items.get(r.itemId)?.effects.get(r.effectId);
    else throw Error('UNSUPPORTED_ICON_DOCUMENT');
    if (!doc) throw Error('ICON_DOCUMENT_MISSING');
    return {owner,doc};
  };
  const targets = plan.refs.map(r => ({...resolve(r),r}));
  if (new Set(targets.map(t=>t.doc.uuid)).size !== targets.length) throw Error('DUPLICATE_ICON_TARGET');
  for (const {doc,r} of targets) {
    if (doc._source.img !== r.img || doc.name !== r.name) throw Error('ICON_SOURCE_CHANGED '+doc.uuid);
    if (!/^icons\/svg\/[a-z0-9-]+\.svg$/.test(r.newImg) &&
        !/^assets\/server-next-migration-icons\/(mighty-force|sword-brandish)\.svg$/.test(r.newImg)) {
      throw Error('UNAPPROVED_ICON_DESTINATION');
    }
  }
  const resources=[];
  for (const url of new Set(targets.map(t=>t.r.newImg))) {
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)});
    if (!response.ok || !(response.headers.get('content-type')??'').includes('svg')) throw Error('ICON_RESOURCE_UNAVAILABLE '+url);
    const svg=await response.text();
    if (!svg.includes('<svg') || /<script\b|<foreignObject\b|\bonload\s*=/i.test(svg)) throw Error('UNEXPECTED_SVG_CONTENT');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(svg));
    const sha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    if (sha256!==plan.resources[url]) throw Error('ICON_RESOURCE_IDENTITY_CHANGED '+url);
    resources.push({url,status:response.status,sha256});
  }
  const owners=[...new Set(targets.map(t=>t.owner))];
  const before=new Map(owners.map(o=>[o.uuid,foundry.utils.deepClone(o._source)]));
  const idsBefore={actors:[...game.actors.keys()].sort(),items:[...game.items.keys()].sort()};
  const diff=(a,b,p='')=> {
    if (Object.is(a,b)) return [];
    if (a && b && typeof a==='object' && typeof b==='object') {
      const keys=new Set([...Object.keys(a),...Object.keys(b)]);
      return [...keys].flatMap(k=>diff(a[k],b[k],p?p+'.'+k:k));
    }
    return [{path:p,before:a,after:b}];
  };
  const pathFor=(owner,doc,raw)=> {
    if (owner===doc) return '';
    if (doc.documentName==='Item') return 'items.'+raw.items.findIndex(x=>x._id===doc.id)+'.';
    if (doc.parent===owner) return 'effects.'+raw.effects.findIndex(x=>x._id===doc.id)+'.';
    const i=raw.items.findIndex(x=>x._id===doc.parent.id);
    return 'items.'+i+'.effects.'+raw.items[i].effects.findIndex(x=>x._id===doc.id)+'.';
  };
  const metadata=['_stats.modifiedTime','_stats.lastModifiedBy','_stats.coreVersion','_stats.systemId','_stats.systemVersion'];
  const allowed=new Map(owners.map(o=>[o.uuid,new Set(metadata)]));
  for (const {owner,doc} of targets) {
    const prefix=pathFor(owner,doc,before.get(owner.uuid)),set=allowed.get(owner.uuid);
    for (const leaf of ['img',...metadata]) set.add(prefix+leaf);
    if (doc.parent?.documentName==='Item') {
      const parentPrefix=pathFor(owner,doc.parent,before.get(owner.uuid));
      for(const leaf of metadata) set.add(parentPrefix+leaf);
    }
  }
  const changed=[];
  try {
    for (const {doc,r} of targets) {
      await doc.update({img:r.newImg});
      if (doc._source.img!==r.newImg) throw Error('ICON_UPDATE_READBACK_FAILED '+doc.uuid);
      changed.push({uuid:doc.uuid,oldImg:r.img,newImg:r.newImg});
    }
    const differences=owners.map(o=>({uuid:o.uuid,diff:diff(before.get(o.uuid),o._source)}));
    const validMetadata=x=> {
      if(x.path.endsWith('_stats.coreVersion'))return x.after==='14.368';
      if(x.path.endsWith('_stats.systemId'))return x.after==='dnd5e';
      if(x.path.endsWith('_stats.systemVersion'))return x.after==='6.0.5';
      if(x.path.endsWith('_stats.lastModifiedBy'))return x.after===game.user.id;
      if(x.path.endsWith('_stats.modifiedTime'))return Number.isFinite(x.after);
      return true;
    };
    const unexpected=differences.flatMap(o=>o.diff.filter(x=>!allowed.get(o.uuid).has(x.path)||!validMetadata(x)).map(x=>({uuid:o.uuid,...x})));
    const idsAfter={actors:[...game.actors.keys()].sort(),items:[...game.items.keys()].sort()};
    if (unexpected.length || JSON.stringify(idsBefore)!==JSON.stringify(idsAfter)) {
      return {ok:false,reason:'UNEXPECTED_SOURCE_DIFF_OR_IDS',changed,unexpected,differences,idsBefore,idsAfter,resources};
    }
    return {ok:true,changed,ownerCount:owners.length,differences,idsBefore,idsAfter,resources,paidPackageFunctionalTests:0};
  } catch(error) {
    return {ok:false,reason:String(error),changed,remaining:targets.filter(t=>t.doc._source.img!==t.r.newImg).map(t=>({uuid:t.doc.uuid,img:t.doc._source.img})),resources};
  }
}
