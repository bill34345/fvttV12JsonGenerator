/** Compendium Actors are authored templates, not live status documents. */
export function patchCompendiumStatusReconciliation(source) {
  if (source.includes('SERVERNEXT_COMPENDIUM_SOURCE_GUARD_1')) throw new Error('DAE compendium status guard is already applied');
  const anchors = ['function scheduleReconciliation(actor) {', 'async function reconcileActorStatuses(actor) {'];
  let patched = source;
  for (const anchor of anchors) {
    if (patched.split(anchor).length !== 2) throw new Error(`DAE status reconciliation anchor differs: ${anchor}`);
    const ending = patched.includes(`${anchor}\r\n`) ? '\r\n' : '\n';
    const original = anchor + ending;
    const guard = [anchor,
      '    // SERVERNEXT_COMPENDIUM_SOURCE_GUARD_1: preserve authored template statuses.',
      '    if (actor.pack)',
      '        return;',
      ''].join(ending);
    patched = patched.replace(original, guard);
  }
  return patched;
}
