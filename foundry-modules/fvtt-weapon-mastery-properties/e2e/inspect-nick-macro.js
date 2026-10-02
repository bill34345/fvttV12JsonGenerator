/* Read-only GM Script Macro: capture before and after the two actual Light attacks.
 * No rolls, action-budget changes, or document writes. Keep separate from the initializer.
 */
{
  const namespace = 'fvtt-weapon-mastery-properties';
  const marker = game.messages.get('pBGLgKaEeAkhlPPJ')?.getFlag(namespace, 'e2eFixture');
  const ledger = marker?.ledger;
  if (!game.user.isGM || marker?.role !== 'ledger' || ledger?.runId !== 'WMP-E2E-12767f4e0f86'
    || game.world.id !== ledger.worldId || game.combat?.id !== ledger.combatId) {
    throw new Error('Nick inspection requires the exact owned batch and Combat.');
  }
  const source = game.actors.get(ledger.actorIds.source);
  const api = game.modules.get(namespace)?.api;
  const moduleMidi = game.modules.get('midi-qol')?.api;
  const midi = typeof moduleMidi?.hasUsedBonusAction === 'function' ? moduleMidi : globalThis.MidiQOL;
  if (typeof midi?.hasUsedBonusAction !== 'function') throw new Error('Midi public bonus-action readback unavailable.');
  const turnKey = `${game.combat.uuid}:${game.combat.round}:${game.combat.turn}`;
  const entries = (source.getFlag(namespace, 'ledger') ?? []).filter(entry => entry.turnKey === turnKey);
  const describe = id => {
    const item = source.items.get(id);
    return { id: item.id, uuid: item.uuid, properties: [...item.system.properties],
      configuration: api.configuration(item), activities: [...item.system.activities.values()].filter(a => a.type === 'attack')
        .map(a => ({ id: a.id, uuid: a.uuid, activation: a.activation, canUse: a.canUse })) };
  };
  const result = { kind: 'nick-action-state', capturedAt: Date.now(), runId: ledger.runId,
    buildId: api.buildId, sourceActorId: source.id, turnKey,
    hasUsedBonusAction: midi.hasUsedBonusAction(source), midiActions: source.getFlag('midi-qol', 'actions') ?? {},
    firstWeapon: describe(ledger.supportItemIds.nickFirst), nickWeapon: describe(ledger.itemIds.nick),
    attacks: entries.map(({ attackId, itemUuid, activityUuid, step, attackMode, lightAttack, lightExtraAttack,
      usedRuleIds, attackMessageId }) => ({ attackId, itemUuid, activityUuid, step, attackMode,
      lightAttack, lightExtraAttack, usedRuleIds, attackMessageId })) };
  const escaped = JSON.stringify(result, null, 2).replace(/[&<>]/g,
    value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[value]);
  await foundry.applications.api.DialogV2.wait({ window: { title: `${ledger.runId} Nick action state` },
    content: `<textarea readonly style="width:100%;height:30em">${escaped}</textarea>`,
    buttons: [{ action: 'close', label: 'Close' }] });
}
