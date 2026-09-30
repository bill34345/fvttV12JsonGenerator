/** Specific fixture recovery, not a general permission to delete unmarked documents. */
export interface CleanupDocument {
  id: string; parentId?: string | null; type?: string; marker: unknown; sourceMarker: unknown;
  createdTime?: number; sourceIds?: string[]; items?: CleanupDocument[]; effects?: CleanupDocument[];
  statuses?: string[]; systemType?: string; autoCreated?: unknown; sourceAutoCreated?: unknown;
}
export interface NextVmCleanupSnapshot {
  sourceDispatchId: string; sourcePhase: string; initialActorsAbsent: boolean;
  dae: { active: boolean; version: string }; actors: CleanupDocument[];
}
export interface NextVmCleanupBinding {
  sourceDispatchId: string;
  actors: Array<{ id: string; type: string; createdTime: number; itemIds: string[]; effectIds: string[] }>;
  automaticCondition: { actorId: string; id: string; inputEffectId: string; status: string; createdTime: number };
}

export function requireNextVmCleanupOwnership(snapshot: NextVmCleanupSnapshot, binding: NextVmCleanupBinding) {
  const fail = (reason: string): never => { throw new Error(`Cleanup ownership blocked: ${reason}`); };
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((value, i) => value === [...b].sort()[i]);
  const owned = (d: CleanupDocument) => d.marker === binding.sourceDispatchId && d.sourceMarker === binding.sourceDispatchId;
  if (snapshot.sourceDispatchId !== binding.sourceDispatchId || snapshot.sourcePhase !== 'prepared' || snapshot.initialActorsAbsent !== true
    || snapshot.dae.active !== true || snapshot.dae.version !== '14.0.14') fail('current source, birth evidence and exact DAE required');
  if (!same(snapshot.actors.map(d => d.id), binding.actors.map(d => d.id))) fail('actor set changed');
  const automatic = binding.automaticCondition;
  for (const expected of binding.actors) {
    const actor = snapshot.actors.find(d => d.id === expected.id)!;
    if (!owned(actor) || actor.type !== expected.type || actor.createdTime !== expected.createdTime) fail(`actor identity ${actor.id}`);
    const items = actor.items ?? [], effects = actor.effects ?? [];
    const effectIds = [...expected.effectIds, ...(actor.id === automatic.actorId ? [automatic.id] : [])];
    if (!same(items.map(d => d.id), expected.itemIds) || !same(effects.map(d => d.id), effectIds)
      || !same(actor.sourceIds ?? [], [...expected.itemIds, ...effectIds])) fail(`embedded/source set ${actor.id}`);
    for (const item of items) if (item.parentId !== actor.id || !owned(item)) fail(`item ${actor.id}/${item.id}`);
    for (const effect of effects) {
      if (effect.parentId !== actor.id) fail(`effect parent ${effect.id}`);
      if (effect.id !== automatic.id || actor.id !== automatic.actorId) {
        if (!owned(effect)) fail(`effect ${actor.id}/${effect.id}`);
        continue;
      }
      const input = effects.find(d => d.id === automatic.inputEffectId);
      // Class, name, temporary label and static ID alone never grant an exception.
      if (!input || !owned(input) || !input.statuses?.includes(automatic.status)
        || effect.type !== 'condition' || effect.systemType !== automatic.status
        || !same(effect.statuses ?? [], [automatic.status]) || effect.marker !== null || effect.sourceMarker !== null
        || effect.autoCreated !== true || effect.sourceAutoCreated !== true || effect.createdTime !== automatic.createdTime
        || !input.createdTime || input.createdTime > effect.createdTime || effect.createdTime - input.createdTime > 1000) {
        fail(`automatic condition provenance ${actor.id}/${effect.id}`);
      }
    }
  }
  return { ready: true as const, automaticCondition: { actorId: automatic.actorId, id: automatic.id,
    basis: 'Exact enabled DAE, owned status input, actual autoCreated flag, source presence, parent and captured birth timestamps.' } };
}
