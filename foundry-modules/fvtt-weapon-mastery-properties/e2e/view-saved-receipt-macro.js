/* Read-only GM viewer for already exported batch receipts. Never re-exports a case
 * or changes its observations. The visible textarea provides the full JSON when
 * clipboard transport returns stale content. Keep separate from the initializer.
 */
{
  const namespace = 'fvtt-weapon-mastery-properties';
  const marker = game.messages.get('pBGLgKaEeAkhlPPJ')?.getFlag(namespace, 'e2eFixture');
  const ledger = marker?.ledger;
  if (!game.user.isGM || marker?.role !== 'ledger' || ledger?.runId !== 'WMP-E2E-12767f4e0f86'
    || game.world.id !== ledger.worldId) throw new Error('Exact owned WMP batch is required.');
  const scenarios = Object.keys(ledger.cases).filter(name => ledger.cases[name]?.status === 'exported'
    && ledger.cases[name]?.receipt?.runId === ledger.runId && ledger.cases[name]?.receipt?.scenario === name);
  const selected = await foundry.applications.api.DialogV2.wait({
    window: { title: `${ledger.runId} choose saved receipt` },
    content: '<p>Read an existing exported receipt. No case state or observations will be changed.</p>',
    buttons: scenarios.map(name => ({ action: name, label: name, callback: () => name })),
  });
  if (scenarios.includes(selected)) {
    const entry = ledger.cases[selected];
    const output = { ...entry.receipt, retrieval: { mode: 'stored-case-read-only', ledgerMessageId: ledger.messageId,
      scenario: selected, caseStatus: entry.status, currentActiveCase: ledger.activeCase,
      observedEffect: entry.observedEffect ?? null,
      primaryCheckpointEffects: entry.primaryAfter?.target?.effects ?? null } };
    const json = JSON.stringify(output, null, 2);
    const escaped = json.replace(/[&<>]/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[value]);
    await foundry.applications.api.DialogV2.wait({
      window: { title: `${ledger.runId} full saved ${selected} receipt` },
      content: `<p>Complete stored receipt (${json.length} characters). Keep its original build identity.</p>`
        + `<textarea data-wmp-saved-receipt="${selected}" readonly style="width:100%;height:30em">${escaped}</textarea>`,
      buttons: [{ action: 'close', label: 'Close' }],
    });
  }
}
