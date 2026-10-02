/* Read-only Foundry GM Script Macro. Does not roll, change documents, or settle rules.
 * Keep separate from the persistent fixture initializer. Select the exact batch below.
 * The temporary Macro document itself is owned by this test batch and cleaned at batch end.
 */
{
  const namespace = 'fvtt-weapon-mastery-properties';
  const ledgerId = 'pBGLgKaEeAkhlPPJ';
  const marker = game.messages.get(ledgerId)?.getFlag(namespace, 'e2eFixture');
  const ledger = marker?.ledger;
  if (!game.user.isGM || marker?.role !== 'ledger' || ledger?.runId !== 'WMP-E2E-12767f4e0f86'
    || game.world.id !== ledger.worldId || canvas.scene?.id !== ledger.sceneId) {
    throw new Error('Cleave inspection requires the exact owned batch and active scene.');
  }
  const actors = Object.fromEntries(Object.entries(ledger.actorIds).map(([role, id]) => [role, game.actors.get(id)]));
  const tokens = Object.fromEntries(Object.entries(ledger.tokenIds).map(([role, id]) => [role, canvas.tokens.get(id)]));
  const item = actors.source.items.get(ledger.itemIds.cleave);
  const activity = item.system.activities.find(entry => entry.type === 'attack');
  const size = canvas.dimensions.size;
  const describeToken = token => {
    const document = token?.document ?? token;
    return token ? { id: document.id, documentName: document.documentName, actorId: token.actor?.id,
      x: document.x, y: document.y, width: document.width, height: document.height,
      elevation: document.elevation } : null;
  };
  const measure = (from, to) => {
    try {
      const a = from.document ?? from;
      const b = to.document ?? to;
      const result = canvas.grid.measurePath([
        { x: a.x + size / 2, y: a.y + size / 2 },
        { x: b.x + size / 2, y: b.y + size / 2 },
      ]);
      return { distance: result.distance, cost: result.cost };
    } catch (error) { return { error: String(error) }; }
  };
  const data = {
    kind: 'read-only-cleave-selection-inputs', runId: ledger.runId,
    buildId: game.modules.get(namespace)?.api?.buildId,
    worldId: game.world.id, sceneId: canvas.scene.id,
    grid: { type: canvas.scene.grid.type, size, distance: canvas.scene.grid.distance,
      units: canvas.scene.grid.units, diagonals: canvas.grid.diagonals,
      className: canvas.grid.constructor.name, measurePathAvailable: typeof canvas.grid.measurePath === 'function' },
    weapon: { id: item.id, equipped: item.system.equipped, range: item.system.range,
      type: item.system.type, properties: [...item.system.properties],
      activityId: activity.id, actionType: activity.actionType,
      getActionType: activity.getActionType(), damageBase: item.system.damage.base,
      activityDamageParts: activity.damage.parts, activityToken: describeToken(activity.token) },
    actors: Object.fromEntries(Object.entries(actors).map(([role, actor]) => [role, {
      id: actor.id, size: actor.system.traits.size, hp: actor.system.attributes.hp.value,
    }])),
    tokens: Object.fromEntries(Object.entries(tokens).map(([role, token]) => [role, describeToken(token)])),
    controlledTokens: canvas.tokens.controlled.map(describeToken),
    activeSourceTokens: actors.source.getActiveTokens(true, true).map(describeToken),
    measurements: { sourceToPrimary: measure(tokens.source, tokens.target),
      sourceToSecondary: measure(tokens.source, tokens.secondary),
      primaryToSecondary: measure(tokens.target, tokens.secondary) },
  };
  const json = JSON.stringify(data, null, 2);
  const escaped = json.replace(/[&<>]/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[value]);
  await foundry.applications.api.DialogV2.wait({
    window: { title: `${ledger.runId} read-only Cleave inspection` },
    content: `<textarea readonly style="width:100%;height:30em">${escaped}</textarea>`,
    buttons: [{ action: 'close', label: 'Close' }],
  });
}
