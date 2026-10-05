// Native Foundry Script Macro body. Only changes this client's tracker view and
// creates a readback ChatMessage; does not activate or advance any Combat.
if (location.origin !== 'http://127.0.0.1:30002' || game.world.id !== 'cor-cotn' || !game.user.isGM) {
  throw new Error('Wrong ServerNext identity');
}
const own = game.combats.get('xYa05YifCrc4A3Dh');
const target = game.actors.get('6G73ekCjdnN2UUZU');
if (!own || own.active || own.name !== 'AG-MIDI6L-20260921-E-Reactions'
    || target?.name !== 'AG-MIDI6L-20260921-Target'
    || !own.getCombatantsByActor(target).length) throw new Error('Owned fixture identity mismatch');
const snapshot = () => ({worldTime: game.time.worldTime, activeScene: game.scenes.active?.id,
  activeCombats: game.combats.filter(c => c.active).map(c => ({id:c.id, round:c.round, turn:c.turn}))});
const before = snapshot();
const originalViewedCombat = ui.combat.viewed?.id ?? null;
await ui.combat.render({force: true, combat: own});
const after = snapshot();
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Shared state changed during local render; inspect without reverting others');
const report = {case: 'Q E03/C06 exact tracker-view preflight', at: new Date().toISOString(),
  originalViewedCombat, ownCombat: own.uuid, trackerRendered: ui.combat.rendered,
  trackerViewed: ui.combat.viewed?.uuid, gameCombat: game.combat?.uuid,
  targetInCombat: target.inCombat, before, after};
const safe = JSON.stringify(report, null, 2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
await ChatMessage.create({content: `<pre>${safe}</pre>`});
if (game.combat !== own || ui.combat.viewed !== own || !target.inCombat) {
  throw new Error('Tracker render preflight did not establish owned combat context; report actual readback');
}
