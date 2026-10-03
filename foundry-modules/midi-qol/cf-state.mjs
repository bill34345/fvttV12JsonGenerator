export function beginCfCast(state, effects, regions) {
  delete state.deletion;
  state.casts += 1;
  state.castStart = Date.now();
  state.castEvidence = { cast: state.casts, effectsBefore: effects.map(e => e.uuid), regionsBefore: regions.map(r => r.uuid), createdEffects: [], createdRegions: [], useResult: 'PENDING' };
}

export function currentCastLink(state, effects, regions) {
  const evidence = state.castEvidence;
  if (!evidence || evidence.cast !== state.casts || !evidence.createdEffects.length || !evidence.createdRegions.length) return false;
  if (evidence.useResult !== 'RETURNED') return false;
  return effects.length === 1 && effects[0].type === 'base'
    && evidence.createdEffects.includes(effects[0].uuid)
    && !evidence.effectsBefore.includes(effects[0].uuid)
    && regions.length > 0 && regions.every(region => evidence.createdRegions.includes(region.uuid)
      && !evidence.regionsBefore.includes(region.uuid) && region.dependentOn === effects[0].uuid);
}

export function assertKnownSceneDocuments(knownKeys, currentKeys) {
  const unknown = currentKeys.filter(key => !knownKeys.includes(key));
  if (unknown.length) throw new Error(`Refusing scene cleanup: unowned embedded documents ${unknown.join(', ')}`);
}
