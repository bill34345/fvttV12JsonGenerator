// Narrow source/history projection for the user's approved 6.0.5 Eladrin case.
// No Foundry globals, filesystem, implicit writes, migration or source guessing.
export const ELADRIN_APPROVAL = 'USER_APPROVED_ELADRIN_EXISTING_2024_TRANCE_AND_MPMM_SEASON_20261002';
export const ELADRIN = Object.freeze({
  actorId: 'MkOcySfY7k3A1AAl', speciesId: 'V5QhgpThojOk76m8', advancementId: 'idr03DnE2KVNclhd',
  missingId: 'oFrdemKo1y1Hcrx0', tranceId: 'sw1tLIZrkxRBFoWL',
  originalIds: ['3PjElAyD0hMR1uDi','gC5nQXPceapoK7Ly','hz89rlE3yTJMmdta','dUnq2Od9UtlhvOvp','sAGaAz5ZWyCw4g45','oFrdemKo1y1Hcrx0','HgFcqg2V1Aedclwg'],
});
export const ELADRIN_SEASON_PARAGRAPH = '<p><strong>雅灵季节（MPMM）</strong>当你使用出神完成一次长休时，你可以更换自己的季节。</p>';

export function projectEladrinGrantAdoption(species, sourcesByExistingId, authorization) {
  // changes is a semantic projection, not a ready-made wire payload.
  // The accepted 14.368/6.0.5 API repair submitted candidate.system as a
  // complete root field with recursive:false. A transported nested
  // ForcedReplacement was persisted as ordinary JSON in this exact path.
  if (authorization !== ELADRIN_APPROVAL) throw Error('Explicit Eladrin replacement authorization required');
  if (species?._id !== ELADRIN.speciesId || species.type !== 'race' || species.name !== '雅灵') throw Error('Wrong species identity');
  if (Array.isArray(species.system?.advancement)) throw Error('No implicit legacy advancement migration');
  const candidate = structuredClone(species), grant = candidate.system?.advancement?.[ELADRIN.advancementId];
  if (grant?.type !== 'ItemGrant' || grant.configuration?.items?.length !== 7) throw Error('Unexpected grant scope');
  const added = grant.value?.added;
  if (!added || JSON.stringify(Object.keys(added).sort()) !== JSON.stringify([...ELADRIN.originalIds].sort())) throw Error('Grant history drift');
  const actualIds = ELADRIN.originalIds.map(id => id === ELADRIN.missingId ? ELADRIN.tranceId : id);
  if (JSON.stringify(Object.keys(sourcesByExistingId).sort()) !== JSON.stringify([...actualIds].sort())) throw Error('All seven reviewed sources required');
  const destinations = actualIds.map(id => sourcesByExistingId[id]);
  if (destinations.some(uuid => !/^Item\.[a-f0-9]{16}$/.test(uuid)) || new Set(destinations).size !== 7) throw Error('Unsafe or duplicate source destination');
  for (const [index,id] of ELADRIN.originalIds.entries()) {
    const old = `Actor.${ELADRIN.actorId}.Item.${id}`;
    if (grant.configuration.items[index].uuid !== old || added[id] !== old) throw Error('Original grant source/history changed');
    grant.configuration.items[index].uuid = destinations[index];
  }
  // Keep the six already-owned documents and adopt the existing Trance rather
  // than recreating the deleted Item. Values must match configuration UUIDs:
  // dnd5e uses this set both for checked entries and skipExisting.
  grant.value.added = Object.fromEntries(actualIds.map((id,index) => [id,destinations[index]]));
  const changes = {
    _id: ELADRIN.speciesId,
    [`system.advancement.${ELADRIN.advancementId}.configuration.items`]: structuredClone(grant.configuration.items),
    [`system.advancement.${ELADRIN.advancementId}.value.added`]: structuredClone(grant.value.added),
  };
  const oldLink = `@UUID[Actor.${ELADRIN.actorId}.Item.${ELADRIN.missingId}]`;
  const description = candidate.system?.description?.value;
  if (typeof description === 'string') {
    if (description.split(oldLink).length !== 2) throw Error('Expected one missing Trance description link');
    candidate.system.description.value = description.replace(oldLink, `@UUID[Actor.${ELADRIN.actorId}.Item.${ELADRIN.tranceId}]`);
    changes['system.description.value'] = candidate.system.description.value;
  }
  return { candidate, actualIds, destinations, changes };
}

export function addEladrinSeasonClause(trance, authorization) {
  if (authorization !== ELADRIN_APPROVAL || trance?._id !== ELADRIN.tranceId || trance.type !== 'feat'
      || trance._stats?.compendiumSource !== 'Compendium.dnd5e.origins24.Item.phbsptTrance0000'
      || trance.system?.source?.rules !== '2024') throw Error('Existing approved 2024 Trance identity required');
  const candidate=structuredClone(trance), before=candidate.system?.description?.value;
  if (typeof before !== 'string' || before.includes(ELADRIN_SEASON_PARAGRAPH)) throw Error('Unexpected or already amended Trance');
  candidate.system.description.value=before+'\n'+ELADRIN_SEASON_PARAGRAPH;
  return {candidate,changes:{_id:trance._id,'system.description.value':candidate.system.description.value}};
}

export function eladrinSourceTemplate(original, destination, folderId, creatorUserId, originHash, authorization) {
  const actualIds=ELADRIN.originalIds.map(id=>id===ELADRIN.missingId?ELADRIN.tranceId:id);
  if (authorization!==ELADRIN_APPROVAL || !actualIds.includes(original?._id) || original.type!=='feat'
      || !/^Item\.[a-f0-9]{16}$/.test(destination) || !/^[a-f0-9]{16}$/.test(folderId)
      || !/^[A-Za-z0-9]{16}$/.test(creatorUserId) || !/^[a-f0-9]{64}$/.test(originHash)) throw Error('Unapproved Eladrin source template');
  const candidate=structuredClone(original);
  candidate._id=destination.slice(5);candidate.folder=folderId;candidate.sort=0;
  candidate.ownership={default:0,[creatorUserId]:3};
  const originalCompendiumSource=candidate._stats?.compendiumSource??null;
  delete candidate._stats;
  candidate.flags??={};candidate.flags.dnd5e??={};
  delete candidate.flags.dnd5e.sourceId;delete candidate.flags.dnd5e.advancementOrigin;
  candidate.flags.world??={};
  candidate.flags.world.nextEladrinSource={batch:'NEXT-ELADRIN-20261002',authorization,originUuid:`Actor.${ELADRIN.actorId}.Item.${original._id}`,originHash,originalCompendiumSource};
  if (!candidate.system.identifier) candidate.system.identifier=`legacy-grant-${candidate._id}`;
  return candidate;
}

export function projectEladrinFeatureLink(original, destination, authorization) {
  const actualIds=ELADRIN.originalIds.map(id=>id===ELADRIN.missingId?ELADRIN.tranceId:id);
  if (authorization!==ELADRIN_APPROVAL || !actualIds.includes(original?._id) || original.type!=='feat'
      || !/^Item\.[a-f0-9]{16}$/.test(destination)) throw Error('Unapproved Eladrin feature linkage');
  const candidate=structuredClone(original);candidate.flags??={};candidate.flags.dnd5e??={};
  const origin=`${ELADRIN.speciesId}.${ELADRIN.advancementId}`;
  if (candidate.flags.dnd5e.advancementOrigin && candidate.flags.dnd5e.advancementOrigin!==origin) throw Error('Feature grant origin drift');
  candidate.flags.dnd5e.sourceId=destination;candidate.flags.dnd5e.advancementOrigin=origin;
  return {candidate,changes:{_id:original._id,'flags.dnd5e.sourceId':destination,'flags.dnd5e.advancementOrigin':origin}};
}
